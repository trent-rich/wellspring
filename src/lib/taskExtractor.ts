// AI Task Extractor - Uses Claude API to extract actionable tasks from emails
import type { ParsedEmail } from '../types/gmail';
import type { TaskType } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export interface ExtractedTask {
  title: string;
  description: string;
  taskType: TaskType;
  priority: number; // 1-5, with 1 being highest priority
  dueDate?: string; // ISO date string
  suggestedAssignee?: string;
  confidence: number; // 0-1 confidence score
  sourceContext: string; // Relevant excerpt from email
}

export interface TaskExtractionResult {
  emailId: string;
  threadId: string;
  tasks: ExtractedTask[];
  requiresReply: boolean;
  replyUrgency: 'none' | 'low' | 'medium' | 'high';
  summary: string;
}

const EXTRACTION_PROMPT = `You are an AI assistant that extracts actionable tasks from emails. Analyze the email and identify any tasks, action items, or requests that require attention.

For each task found, provide:
1. title: A concise task title (max 80 chars)
2. description: Brief description of what needs to be done
3. taskType: One of: "action", "email_reply", "document_create", "meeting_schedule", "review", "decision"
4. priority: 1 (urgent/important) to 5 (low priority) based on:
   - Explicit urgency indicators
   - Sender importance
   - Deadlines mentioned
   - Business impact
5. dueDate: ISO date string if a deadline is mentioned or implied (use today's date as reference: {{TODAY}})
6. confidence: 0-1 score of how confident you are this is a real action item

Also assess:
- requiresReply: Does this email need a response?
- replyUrgency: none/low/medium/high
- summary: One sentence summary of the email

Respond ONLY with valid JSON matching this structure:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "taskType": "action|email_reply|document_create|meeting_schedule|review|decision",
      "priority": 1-5,
      "dueDate": "ISO date or null",
      "confidence": 0-1,
      "sourceContext": "relevant excerpt from email"
    }
  ],
  "requiresReply": boolean,
  "replyUrgency": "none|low|medium|high",
  "summary": "string"
}

If no actionable tasks are found, return an empty tasks array.
Do not include FYI emails, newsletters, or automated notifications as tasks unless they explicitly request action.`;

/**
 * Extract tasks from a single email using Claude API
 */
export async function extractTasksFromEmail(
  email: ParsedEmail,
  apiKey: string
): Promise<TaskExtractionResult> {
  const today = new Date().toISOString().split('T')[0];
  const prompt = EXTRACTION_PROMPT.replace('{{TODAY}}', today);

  const emailContent = `
From: ${email.from.name || email.from.email} <${email.from.email}>
To: ${email.to.map(t => t.email).join(', ')}
Subject: ${email.subject}
Date: ${email.date.toISOString()}

${email.body.slice(0, 4000)}
`.trim();

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nEmail to analyze:\n${emailContent}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Claude API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '{}';

    // Parse the JSON response
    const parsed = JSON.parse(content);

    return {
      emailId: email.id,
      threadId: email.threadId,
      tasks: parsed.tasks || [],
      requiresReply: parsed.requiresReply || false,
      replyUrgency: parsed.replyUrgency || 'none',
      summary: parsed.summary || email.snippet,
    };
  } catch (error) {
    console.error('Task extraction error:', error);

    // Return empty result on error
    return {
      emailId: email.id,
      threadId: email.threadId,
      tasks: [],
      requiresReply: false,
      replyUrgency: 'none',
      summary: email.snippet,
    };
  }
}

/**
 * Extract tasks from multiple emails with rate limiting
 */
export async function extractTasksFromEmails(
  emails: ParsedEmail[],
  apiKey: string,
  onProgress?: (processed: number, total: number) => void
): Promise<TaskExtractionResult[]> {
  const results: TaskExtractionResult[] = [];
  const DELAY_MS = 500; // Rate limit: 2 requests per second

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];

    // Skip automated/system emails
    if (shouldSkipEmail(email)) {
      results.push({
        emailId: email.id,
        threadId: email.threadId,
        tasks: [],
        requiresReply: false,
        replyUrgency: 'none',
        summary: email.snippet,
      });
      continue;
    }

    const result = await extractTasksFromEmail(email, apiKey);
    results.push(result);

    onProgress?.(i + 1, emails.length);

    // Rate limiting delay
    if (i < emails.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  return results;
}

/**
 * Determine if an email should be skipped (newsletters, automated, etc.)
 */
function shouldSkipEmail(email: ParsedEmail): boolean {
  const skipPatterns = [
    /noreply@/i,
    /no-reply@/i,
    /donotreply@/i,
    /notifications@/i,
    /newsletter@/i,
    /updates@/i,
    /mailer-daemon/i,
    /postmaster@/i,
  ];

  const fromEmail = email.from.email.toLowerCase();
  if (skipPatterns.some(pattern => pattern.test(fromEmail))) {
    return true;
  }

  // Skip if labeled as promotions or social
  if (email.labels.includes('CATEGORY_PROMOTIONS') ||
      email.labels.includes('CATEGORY_SOCIAL') ||
      email.labels.includes('CATEGORY_UPDATES')) {
    return true;
  }

  return false;
}

/**
 * Get the Claude API key from environment
 */
export function getAnthropicApiKey(): string | null {
  return import.meta.env.VITE_ANTHROPIC_API_KEY || null;
}

/**
 * Check if the Anthropic API key is configured
 */
export function isAnthropicConfigured(): boolean {
  return !!getAnthropicApiKey();
}
