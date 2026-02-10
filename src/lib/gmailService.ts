// Gmail Service - Fetches and parses emails from Gmail API
import type {
  GmailMessage,
  GmailMessageList,
  GmailMessagePart,
  GmailListParams,
  ParsedEmail,
  EmailAddress,
  GmailTokens,
} from '../types/gmail';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_STORAGE_KEY = 'gmail_tokens';

// ============================================
// Token Management
// ============================================

export function getStoredTokens(): GmailTokens | null {
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as GmailTokens;
  } catch {
    return null;
  }
}

export function storeTokens(tokens: GmailTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function isTokenValid(): boolean {
  const tokens = getStoredTokens();
  if (!tokens) {
    console.log('[GmailService] isTokenValid: No tokens found');
    return false;
  }

  const now = Date.now();
  const expiresAt = tokens.expiresAt;
  const isValid = expiresAt > now + 5 * 60 * 1000;

  console.log('[GmailService] isTokenValid:', {
    hasTokens: true,
    expiresAt: new Date(expiresAt).toISOString(),
    now: new Date(now).toISOString(),
    isValid,
    minutesUntilExpiry: Math.round((expiresAt - now) / 60000),
  });

  return isValid;
}

export function getAccessToken(): string | null {
  const tokens = getStoredTokens();
  if (!tokens || !isTokenValid()) return null;
  return tokens.accessToken;
}

// ============================================
// Gmail API Functions
// ============================================

async function gmailFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  console.log('[GmailService] gmailFetch called:', endpoint, options.method || 'GET');

  const accessToken = getAccessToken();
  console.log('[GmailService] Access token exists?', !!accessToken);

  if (!accessToken) {
    console.error('[GmailService] No valid access token!');
    throw new Error('No valid Gmail access token. Please reconnect your Google account.');
  }

  console.log('[GmailService] Making request to:', `${GMAIL_API_BASE}${endpoint}`);
  const response = await fetch(`${GMAIL_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  console.log('[GmailService] Response status:', response.status);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('[GmailService] API error:', error);
    throw new Error(
      `Gmail API error: ${response.status} - ${error.error?.message || response.statusText}`
    );
  }

  return response.json();
}

/**
 * List emails from Gmail
 */
export async function listEmails(params: GmailListParams = {}): Promise<GmailMessageList> {
  const searchParams = new URLSearchParams();

  if (params.maxResults) searchParams.set('maxResults', params.maxResults.toString());
  if (params.pageToken) searchParams.set('pageToken', params.pageToken);
  if (params.q) searchParams.set('q', params.q);
  if (params.labelIds) {
    params.labelIds.forEach(id => searchParams.append('labelIds', id));
  }
  if (params.includeSpamTrash !== undefined) {
    searchParams.set('includeSpamTrash', params.includeSpamTrash.toString());
  }

  const query = searchParams.toString();
  return gmailFetch<GmailMessageList>(`/messages${query ? `?${query}` : ''}`);
}

/**
 * Get a single email by ID with full content
 */
export async function getEmail(messageId: string): Promise<GmailMessage> {
  return gmailFetch<GmailMessage>(`/messages/${messageId}?format=full`);
}

/**
 * Get attachment data from a message
 * @param messageId - The Gmail message ID
 * @param attachmentId - The attachment ID from the message part
 * @returns Base64 encoded attachment data
 */
export async function getAttachment(
  messageId: string,
  attachmentId: string
): Promise<{ data: string; size: number }> {
  return gmailFetch<{ data: string; size: number }>(
    `/messages/${messageId}/attachments/${attachmentId}`
  );
}

/**
 * Extract attachments info from a message
 */
export function extractAttachments(message: GmailMessage): Array<{
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}> {
  const attachments: Array<{
    filename: string;
    mimeType: string;
    attachmentId: string;
    size: number;
  }> = [];

  function findAttachments(part: GmailMessagePart) {
    if (part.filename && part.body.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        size: part.body.size,
      });
    }
    if (part.parts) {
      part.parts.forEach(findAttachments);
    }
  }

  findAttachments(message.payload);
  return attachments;
}

// Document MIME types we care about for contracts
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.oasis.opendocument.text', // .odt
];

// Document file extensions
const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.doc', '.odt'];

/**
 * Check if an attachment is a document (PDF, Word, etc.)
 */
function isDocumentAttachment(filename: string, mimeType: string): boolean {
  const lowerFilename = filename.toLowerCase();
  const isDocExt = DOCUMENT_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
  const isDocMime = DOCUMENT_MIME_TYPES.includes(mimeType);
  return isDocExt || isDocMime;
}

/**
 * Search for an email with a specific attachment (e.g., contract PDF)
 * @param query - Gmail search query
 * @param attachmentFilename - Optional filename pattern to look for
 * @param documentOnly - If true, only return document attachments (PDF, Word, etc.)
 */
export async function findEmailWithAttachment(
  query: string,
  attachmentFilename?: string,
  documentOnly: boolean = false
): Promise<{
  message: GmailMessage | null;
  attachment: {
    filename: string;
    mimeType: string;
    attachmentId: string;
  } | null;
}> {
  try {
    // Search for emails matching the query
    const listResult = await listEmails({ maxResults: 10, q: query });

    if (!listResult.messages || listResult.messages.length === 0) {
      return { message: null, attachment: null };
    }

    // Check each message for attachments
    for (const ref of listResult.messages) {
      const message = await getEmail(ref.id);
      let attachments = extractAttachments(message);

      // Filter for documents only if requested
      if (documentOnly) {
        attachments = attachments.filter(a => isDocumentAttachment(a.filename, a.mimeType));
      }

      if (attachments.length > 0) {
        // If specific filename pattern provided, filter for it
        if (attachmentFilename) {
          const match = attachments.find(a =>
            a.filename.toLowerCase().includes(attachmentFilename.toLowerCase())
          );
          if (match) {
            return { message, attachment: match };
          }
        } else {
          // Return first attachment found
          return { message, attachment: attachments[0] };
        }
      }
    }

    return { message: null, attachment: null };
  } catch (error) {
    console.error('[GmailService] Error finding email with attachment:', error);
    return { message: null, attachment: null };
  }
}

/**
 * Get multiple emails by ID (batched)
 */
export async function getEmails(messageIds: string[]): Promise<GmailMessage[]> {
  // Fetch in parallel with concurrency limit
  const BATCH_SIZE = 10;
  const results: GmailMessage[] = [];

  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const batch = messageIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(id => getEmail(id)));
    results.push(...batchResults);
  }

  return results;
}

// ============================================
// Email Parsing Functions
// ============================================

/**
 * Parse email address string like "John Doe <john@example.com>"
 */
function parseEmailAddress(raw: string): EmailAddress {
  const match = raw.match(/^(?:(.+?)\s*)?<?([^\s<>]+@[^\s<>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim().replace(/^["']|["']$/g, ''),
      email: match[2].toLowerCase(),
    };
  }
  return { email: raw.toLowerCase() };
}

/**
 * Parse multiple email addresses from a header value
 */
function parseEmailAddresses(raw: string | undefined): EmailAddress[] {
  if (!raw) return [];

  // Split by comma, but be careful of commas inside quotes
  const addresses: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of raw) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      if (current.trim()) addresses.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) addresses.push(current.trim());

  return addresses.map(parseEmailAddress);
}

/**
 * Get header value from message
 */
function getHeader(message: GmailMessage, name: string): string | undefined {
  const header = message.payload.headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value;
}

/**
 * Extract body text from message parts recursively
 */
function extractBody(part: GmailMessagePart, preferHtml = false): { text: string; html?: string } {
  const result: { text: string; html?: string } = { text: '' };

  if (part.mimeType === 'text/plain' && part.body.data) {
    result.text = decodeBase64(part.body.data);
  } else if (part.mimeType === 'text/html' && part.body.data) {
    result.html = decodeBase64(part.body.data);
    // Strip HTML for plain text version
    result.text = stripHtml(result.html);
  } else if (part.parts) {
    // Multipart message - look for text/plain or text/html
    for (const subpart of part.parts) {
      const subResult = extractBody(subpart, preferHtml);
      if (subResult.text && !result.text) result.text = subResult.text;
      if (subResult.html && !result.html) result.html = subResult.html;
    }
  }

  return result;
}

/**
 * Decode base64url encoded string
 */
function decodeBase64(data: string): string {
  // Gmail uses base64url encoding
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    // Fallback for non-UTF8
    return atob(base64);
  }
}

/**
 * Strip HTML tags and decode entities
 */
function stripHtml(html: string): string {
  // Remove style and script tags with content
  let text = html.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Replace br and p tags with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Parse a Gmail message into a cleaner format
 */
export function parseEmail(message: GmailMessage): ParsedEmail {
  const fromHeader = getHeader(message, 'From') || '';
  const toHeader = getHeader(message, 'To') || '';
  const ccHeader = getHeader(message, 'Cc');
  const subject = getHeader(message, 'Subject') || '(No Subject)';
  const dateHeader = getHeader(message, 'Date');

  const body = extractBody(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    from: parseEmailAddress(fromHeader),
    to: parseEmailAddresses(toHeader),
    cc: parseEmailAddresses(ccHeader),
    subject,
    date: dateHeader ? new Date(dateHeader) : new Date(parseInt(message.internalDate)),
    snippet: message.snippet,
    body: body.text,
    bodyHtml: body.html,
    isUnread: message.labelIds?.includes('UNREAD') || false,
    labels: message.labelIds || [],
  };
}

// ============================================
// High-Level Functions
// ============================================

/**
 * Fetch recent emails with optional filtering
 */
export async function fetchRecentEmails(options: {
  maxResults?: number;
  query?: string;
  unreadOnly?: boolean;
  sinceDate?: Date;
} = {}): Promise<ParsedEmail[]> {
  const { maxResults = 20, query, unreadOnly = false, sinceDate } = options;

  // Build Gmail search query
  const queryParts: string[] = [];
  if (query) queryParts.push(query);
  if (unreadOnly) queryParts.push('is:unread');
  if (sinceDate) {
    const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '/');
    queryParts.push(`after:${dateStr}`);
  }

  // Only get inbox emails (not sent, spam, trash)
  queryParts.push('in:inbox');

  const listResult = await listEmails({
    maxResults,
    q: queryParts.join(' '),
  });

  if (!listResult.messages || listResult.messages.length === 0) {
    return [];
  }

  const messageIds = listResult.messages.map(m => m.id);
  const fullMessages = await getEmails(messageIds);

  return fullMessages.map(parseEmail);
}

/**
 * Fetch emails since last sync
 */
export async function fetchEmailsSinceLastSync(
  lastSyncTime: Date | null,
  maxResults = 50
): Promise<ParsedEmail[]> {
  return fetchRecentEmails({
    maxResults,
    sinceDate: lastSyncTime || undefined,
  });
}

/**
 * Check if Gmail is connected and token is valid
 */
export function isGmailConnected(): boolean {
  return isTokenValid();
}

// ============================================
// Email Draft Creation Functions
// ============================================

export interface DraftEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
}

/**
 * Encode email content for Gmail API (base64url encoding)
 */
function encodeEmail(options: DraftEmailOptions): string {
  const { to, cc, bcc, subject, body, isHtml = false } = options;

  // Build email headers
  const headers: string[] = [
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
  ];

  if (cc && cc.length > 0) {
    headers.push(`Cc: ${cc.join(', ')}`);
  }

  if (bcc && bcc.length > 0) {
    headers.push(`Bcc: ${bcc.join(', ')}`);
  }

  if (isHtml) {
    headers.push(`Content-Type: text/html; charset=utf-8`);
  } else {
    headers.push(`Content-Type: text/plain; charset=utf-8`);
  }

  // Combine headers and body
  const email = `${headers.join('\r\n')}\r\n\r\n${body}`;

  // Base64url encode
  const base64 = btoa(unescape(encodeURIComponent(email)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create a draft email in Gmail
 * Returns the draft ID if successful
 */
export async function createDraft(options: DraftEmailOptions): Promise<{
  success: boolean;
  draftId?: string;
  error?: string;
}> {
  console.log('[GmailService] createDraft called with:', {
    to: options.to,
    subject: options.subject,
    bodyPreview: options.body.substring(0, 100) + '...',
  });

  try {
    const raw = encodeEmail(options);
    console.log('[GmailService] Email encoded, calling Gmail API...');

    const response = await gmailFetch<{
      id: string;
      message: { id: string; threadId: string };
    }>('/drafts', {
      method: 'POST',
      body: JSON.stringify({
        message: { raw },
      }),
    });

    console.log('[GmailService] Draft created successfully:', response.id);
    return {
      success: true,
      draftId: response.id,
    };
  } catch (error) {
    console.error('[GmailService] Failed to create draft:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create draft',
    };
  }
}

/**
 * Create a draft email with attachment (base64 encoded)
 * Note: For PDF attachments, pass the base64-encoded PDF content
 */
export async function createDraftWithAttachment(
  options: DraftEmailOptions & {
    attachment?: {
      filename: string;
      mimeType: string;
      content: string; // base64 encoded content
    };
  }
): Promise<{
  success: boolean;
  draftId?: string;
  error?: string;
}> {
  try {
    const { to, cc, bcc, subject, body, isHtml = false, attachment } = options;

    // Build multipart email
    const boundary = `boundary_${Date.now()}`;

    const headers: string[] = [
      `To: ${to.join(', ')}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
    ];

    if (cc && cc.length > 0) {
      headers.push(`Cc: ${cc.join(', ')}`);
    }

    if (bcc && bcc.length > 0) {
      headers.push(`Bcc: ${bcc.join(', ')}`);
    }

    if (attachment) {
      headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    } else if (isHtml) {
      headers.push(`Content-Type: text/html; charset=utf-8`);
    } else {
      headers.push(`Content-Type: text/plain; charset=utf-8`);
    }

    let emailBody: string;

    if (attachment) {
      // Multipart email with attachment
      emailBody = [
        `--${boundary}`,
        `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
        '',
        body,
        '',
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType}`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        `Content-Transfer-Encoding: base64`,
        '',
        attachment.content,
        '',
        `--${boundary}--`,
      ].join('\r\n');
    } else {
      emailBody = body;
    }

    const email = `${headers.join('\r\n')}\r\n\r\n${emailBody}`;

    // Base64url encode
    const base64 = btoa(unescape(encodeURIComponent(email)));
    const raw = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const response = await gmailFetch<{
      id: string;
      message: { id: string; threadId: string };
    }>('/drafts', {
      method: 'POST',
      body: JSON.stringify({
        message: { raw },
      }),
    });

    return {
      success: true,
      draftId: response.id,
    };
  } catch (error) {
    console.error('[GmailService] Failed to create draft with attachment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create draft',
    };
  }
}

/**
 * Send an email directly (instead of creating a draft)
 */
export async function sendEmail(options: DraftEmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const raw = encodeEmail(options);

    const response = await gmailFetch<{
      id: string;
      threadId: string;
      labelIds: string[];
    }>('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw }),
    });

    return {
      success: true,
      messageId: response.id,
    };
  } catch (error) {
    console.error('[GmailService] Failed to send email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}
