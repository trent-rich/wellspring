// AI Task Extractor - Uses unified AI service to extract actionable tasks from emails
import type { ParsedEmail } from '../types/gmail';
import type { TaskType } from '../types';
import { callAI, isAIConfigured as checkAIConfigured } from './aiService';

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

/**
 * Extract tasks from a single email using unified AI service
 */
export async function extractTasksFromEmail(
  email: ParsedEmail
): Promise<TaskExtractionResult> {
  try {
    const result = await callAI<{
      tasks: ExtractedTask[];
      requiresReply: boolean;
      replyUrgency: 'none' | 'low' | 'medium' | 'high';
      summary: string;
    }>('extract_tasks', {
      subject: email.subject,
      body: email.body.slice(0, 4000),
      from: `${email.from.name || email.from.email} <${email.from.email}>`,
      date: email.date.toISOString(),
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'AI extraction failed');
    }

    return {
      emailId: email.id,
      threadId: email.threadId,
      tasks: result.data.tasks || [],
      requiresReply: result.data.requiresReply || false,
      replyUrgency: result.data.replyUrgency || 'none',
      summary: result.data.summary || email.snippet,
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

    const result = await extractTasksFromEmail(email);
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
 * Check if AI extraction is configured (Edge Function available)
 */
export function isAnthropicConfigured(): boolean {
  // Use the unified AI service configuration check
  return checkAIConfigured();
}
