// Edge Function: Email Sync
// POST /email-sync
// Syncs emails from Gmail to the database

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createSupabaseClient,
  corsHeaders,
  errorResponse,
  successResponse,
  EmailThread,
  Email,
} from '../_shared/supabase.ts';

interface SyncRequest {
  access_token: string;
  full_sync?: boolean;
  max_results?: number;
}

interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
      parts?: Array<{ mimeType: string; body?: { data?: string } }>;
    }>;
  };
}

// Helper to decode base64url
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}

// Helper to extract header
function getHeader(headers: { name: string; value: string }[], name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

// Helper to extract email address from header
function parseEmailAddress(header: string): { email: string; name?: string } {
  const match = header.match(/^(?:"?([^"]*)"?\s*)?<?([^>]+)>?$/);
  if (match) {
    return { name: match[1]?.trim(), email: match[2].trim() };
  }
  return { email: header.trim() };
}

// Helper to parse multiple email addresses
function parseEmailAddresses(header: string): { email: string; name?: string }[] {
  return header.split(',').map((addr) => parseEmailAddress(addr.trim()));
}

// Helper to extract body from message
function extractBody(payload: GmailMessage['payload']): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};

  const processPayload = (p: GmailMessage['payload'] | NonNullable<GmailMessage['payload']['parts']>[0]) => {
    if (p.body?.data) {
      try {
        const decoded = decodeBase64Url(p.body.data);
        if (p.mimeType === 'text/plain') {
          result.text = decoded;
        } else if (p.mimeType === 'text/html') {
          result.html = decoded;
        }
      } catch {
        // Ignore decode errors
      }
    }
    if ('parts' in p && p.parts) {
      for (const part of p.parts) {
        processPayload(part);
      }
    }
  };

  processPayload(payload);
  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // Parse request body
    const body: SyncRequest = await req.json();

    if (!body.access_token) {
      return errorResponse('access_token is required');
    }

    const maxResults = body.max_results ?? 20;

    // Fetch threads from Gmail
    const threadsResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}&labelIds=INBOX`,
      {
        headers: {
          Authorization: `Bearer ${body.access_token}`,
        },
      }
    );

    if (!threadsResponse.ok) {
      const errorText = await threadsResponse.text();
      console.error('Gmail API error:', errorText);
      return errorResponse(`Gmail API error: ${threadsResponse.status}`, 500);
    }

    const threadsData = await threadsResponse.json();
    const threadIds = threadsData.threads?.map((t: { id: string }) => t.id) ?? [];

    const results = {
      threads_processed: 0,
      messages_processed: 0,
      errors: [] as string[],
    };

    // Process each thread
    for (const threadId of threadIds) {
      try {
        // Fetch full thread details
        const threadResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
          {
            headers: {
              Authorization: `Bearer ${body.access_token}`,
            },
          }
        );

        if (!threadResponse.ok) {
          results.errors.push(`Failed to fetch thread ${threadId}`);
          continue;
        }

        const thread: GmailThread = await threadResponse.json();

        if (!thread.messages || thread.messages.length === 0) {
          continue;
        }

        // Get thread subject from first message
        const firstMessage = thread.messages[0];
        const subject = getHeader(firstMessage.payload.headers, 'Subject') ?? '(No Subject)';

        // Collect participants
        const participantSet = new Map<string, { email: string; name?: string }>();
        for (const msg of thread.messages) {
          const from = getHeader(msg.payload.headers, 'From');
          if (from) {
            const parsed = parseEmailAddress(from);
            participantSet.set(parsed.email.toLowerCase(), parsed);
          }
          const to = getHeader(msg.payload.headers, 'To');
          if (to) {
            for (const addr of parseEmailAddresses(to)) {
              participantSet.set(addr.email.toLowerCase(), addr);
            }
          }
        }

        const latestMessage = thread.messages[thread.messages.length - 1];
        const firstMessageDate = new Date(parseInt(firstMessage.internalDate));
        const latestMessageDate = new Date(parseInt(latestMessage.internalDate));

        // Check if thread exists
        const { data: existingThread } = await supabase
          .from('email_threads')
          .select('id')
          .eq('gmail_thread_id', thread.id)
          .single();

        let threadDbId: string;

        if (existingThread) {
          // Update existing thread
          const { data: updated, error: updateError } = await supabase
            .from('email_threads')
            .update({
              gmail_history_id: thread.historyId,
              subject,
              snippet: latestMessage.snippet,
              participants: Array.from(participantSet.values()),
              message_count: thread.messages.length,
              unread_count: thread.messages.filter((m) => m.labelIds?.includes('UNREAD')).length,
              latest_message_at: latestMessageDate.toISOString(),
              last_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingThread.id)
            .select()
            .single();

          if (updateError) {
            results.errors.push(`Failed to update thread ${thread.id}: ${updateError.message}`);
            continue;
          }

          threadDbId = existingThread.id;
        } else {
          // Insert new thread
          const { data: inserted, error: insertError } = await supabase
            .from('email_threads')
            .insert({
              gmail_thread_id: thread.id,
              gmail_history_id: thread.historyId,
              subject,
              snippet: latestMessage.snippet,
              participants: Array.from(participantSet.values()),
              status: 'new',
              message_count: thread.messages.length,
              unread_count: thread.messages.filter((m) => m.labelIds?.includes('UNREAD')).length,
              latest_message_at: latestMessageDate.toISOString(),
              first_message_at: firstMessageDate.toISOString(),
              last_synced_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (insertError) {
            results.errors.push(`Failed to insert thread ${thread.id}: ${insertError.message}`);
            continue;
          }

          threadDbId = inserted.id;
        }

        results.threads_processed++;

        // Process messages in the thread
        for (const msg of thread.messages) {
          // Check if message exists
          const { data: existingMessage } = await supabase
            .from('emails')
            .select('id')
            .eq('gmail_message_id', msg.id)
            .single();

          if (existingMessage) {
            // Skip existing messages (could update if needed)
            continue;
          }

          const from = getHeader(msg.payload.headers, 'From') ?? '';
          const to = getHeader(msg.payload.headers, 'To') ?? '';
          const cc = getHeader(msg.payload.headers, 'Cc');
          const messageSubject = getHeader(msg.payload.headers, 'Subject');
          const body = extractBody(msg.payload);

          const { error: msgError } = await supabase.from('emails').insert({
            gmail_message_id: msg.id,
            gmail_thread_id: msg.threadId,
            thread_id: threadDbId,
            subject: messageSubject,
            from_address: parseEmailAddress(from).email,
            from_name: parseEmailAddress(from).name,
            to_addresses: to ? parseEmailAddresses(to) : [],
            cc_addresses: cc ? parseEmailAddresses(cc) : null,
            body_text: body.text,
            body_html: body.html,
            snippet: msg.snippet,
            gmail_labels: msg.labelIds,
            is_read: !msg.labelIds?.includes('UNREAD'),
            is_starred: msg.labelIds?.includes('STARRED') ?? false,
            is_draft: msg.labelIds?.includes('DRAFT') ?? false,
            is_sent: msg.labelIds?.includes('SENT') ?? false,
            internal_date: new Date(parseInt(msg.internalDate)).toISOString(),
            headers: {
              'Message-ID': getHeader(msg.payload.headers, 'Message-ID'),
              'In-Reply-To': getHeader(msg.payload.headers, 'In-Reply-To'),
              References: getHeader(msg.payload.headers, 'References'),
            },
          });

          if (msgError) {
            results.errors.push(`Failed to insert message ${msg.id}: ${msgError.message}`);
          } else {
            results.messages_processed++;
          }
        }
      } catch (threadErr) {
        results.errors.push(`Error processing thread ${threadId}: ${threadErr.message}`);
      }
    }

    return successResponse({
      success: true,
      ...results,
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return errorResponse(`Unexpected error: ${err.message}`, 500);
  }
});
