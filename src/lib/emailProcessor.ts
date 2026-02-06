// Email Processor - Orchestrates email fetching and task extraction
import { fetchEmailsSinceLastSync, isGmailConnected } from './gmailService';
import {
  extractTasksFromEmails,
  getAnthropicApiKey,
  isAnthropicConfigured,
  type TaskExtractionResult,
} from './taskExtractor';
import { supabase } from './supabase';
import type { ParsedEmail } from '../types/gmail';
import type { TaskType, TaskSource } from '../types';

const SYNC_STATE_KEY = 'ralph_sync_state';
const PROCESSED_EMAILS_KEY = 'ralph_processed_emails';

interface SyncState {
  lastSyncTime: string | null;
  totalEmailsProcessed: number;
  totalTasksCreated: number;
  lastError: string | null;
}

interface ProcessingResult {
  success: boolean;
  emailsProcessed: number;
  tasksCreated: number;
  errors: string[];
}

// ============================================
// Sync State Management
// ============================================

export function getSyncState(): SyncState {
  const stored = localStorage.getItem(SYNC_STATE_KEY);
  if (!stored) {
    return {
      lastSyncTime: null,
      totalEmailsProcessed: 0,
      totalTasksCreated: 0,
      lastError: null,
    };
  }
  try {
    return JSON.parse(stored);
  } catch {
    return {
      lastSyncTime: null,
      totalEmailsProcessed: 0,
      totalTasksCreated: 0,
      lastError: null,
    };
  }
}

export function updateSyncState(updates: Partial<SyncState>): void {
  const current = getSyncState();
  const newState = { ...current, ...updates };
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(newState));
}

function getProcessedEmailIds(): Set<string> {
  const stored = localStorage.getItem(PROCESSED_EMAILS_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

function addProcessedEmailIds(ids: string[]): void {
  const current = getProcessedEmailIds();
  ids.forEach(id => current.add(id));

  // Keep only last 1000 IDs to prevent localStorage bloat
  const idsArray = Array.from(current).slice(-1000);
  localStorage.setItem(PROCESSED_EMAILS_KEY, JSON.stringify(idsArray));
}

// ============================================
// Task Creation
// ============================================

async function createTaskFromExtraction(
  _extraction: TaskExtractionResult,
  task: TaskExtractionResult['tasks'][0],
  email: ParsedEmail
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        owner_id: user.id,
        title: task.title,
        description: `${task.description}\n\n---\nSource: Email from ${email.from.name || email.from.email}\nSubject: ${email.subject}\n\n"${task.sourceContext}"`,
        task_type: task.taskType as TaskType,
        source: 'email' as TaskSource,
        source_id: email.id,
        priority: task.priority,
        due_date: task.dueDate || null,
        status: 'pending',
        stage: 'triage',
        work_mode: 'ralph',
        visibility: 'private',
        decision_class: 'none',
        escalation_level: 0,
        judgment_required: task.taskType === 'decision',
        judgment_type: task.taskType === 'decision' ? 'decision' : null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (error) {
    console.error('Failed to create task:', error);
    return null;
  }
}

// ============================================
// Main Processing Function
// ============================================

export async function processEmails(
  onProgress?: (status: string, progress: number) => void
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    success: false,
    emailsProcessed: 0,
    tasksCreated: 0,
    errors: [],
  };

  try {
    // Check prerequisites
    if (!isGmailConnected()) {
      result.errors.push('Gmail not connected. Please connect your Google account first.');
      return result;
    }

    const apiKey = getAnthropicApiKey();
    if (!apiKey) {
      result.errors.push('Anthropic API key not configured. Please add VITE_ANTHROPIC_API_KEY to your environment.');
      return result;
    }

    onProgress?.('Fetching emails...', 0);

    // Get sync state
    const syncState = getSyncState();
    const lastSync = syncState.lastSyncTime ? new Date(syncState.lastSyncTime) : null;
    const processedIds = getProcessedEmailIds();

    // Fetch emails since last sync
    const emails = await fetchEmailsSinceLastSync(lastSync, 50);

    // Filter out already processed emails
    const newEmails = emails.filter(e => !processedIds.has(e.id));

    if (newEmails.length === 0) {
      onProgress?.('No new emails to process', 100);
      updateSyncState({ lastSyncTime: new Date().toISOString(), lastError: null });
      result.success = true;
      return result;
    }

    onProgress?.(`Processing ${newEmails.length} emails...`, 10);

    // Extract tasks from emails
    const extractions = await extractTasksFromEmails(
      newEmails,
      apiKey,
      (processed, total) => {
        const progress = 10 + (processed / total) * 60;
        onProgress?.(`Analyzing email ${processed}/${total}...`, progress);
      }
    );

    onProgress?.('Creating tasks...', 70);

    // Create tasks in database
    const emailMap = new Map(newEmails.map(e => [e.id, e]));
    let tasksCreated = 0;

    for (const extraction of extractions) {
      const email = emailMap.get(extraction.emailId);
      if (!email) continue;

      for (const task of extraction.tasks) {
        // Only create tasks with confidence > 0.5
        if (task.confidence >= 0.5) {
          const taskId = await createTaskFromExtraction(extraction, task, email);
          if (taskId) tasksCreated++;
        }
      }

      // If email requires reply, create a reply task
      if (extraction.requiresReply && extraction.replyUrgency !== 'none') {
        const priority = extraction.replyUrgency === 'high' ? 1 :
                        extraction.replyUrgency === 'medium' ? 2 : 3;

        await createTaskFromExtraction(extraction, {
          title: `Reply to: ${email.subject}`,
          description: `Email from ${email.from.name || email.from.email} requires a response.`,
          taskType: 'email_reply',
          priority,
          confidence: 0.9,
          sourceContext: email.snippet,
        }, email);
        tasksCreated++;
      }
    }

    // Update processed IDs
    addProcessedEmailIds(newEmails.map(e => e.id));

    // Update sync state
    updateSyncState({
      lastSyncTime: new Date().toISOString(),
      totalEmailsProcessed: syncState.totalEmailsProcessed + newEmails.length,
      totalTasksCreated: syncState.totalTasksCreated + tasksCreated,
      lastError: null,
    });

    onProgress?.('Complete!', 100);

    result.success = true;
    result.emailsProcessed = newEmails.length;
    result.tasksCreated = tasksCreated;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMessage);
    updateSyncState({ lastError: errorMessage });
    console.error('Email processing error:', error);
  }

  return result;
}

// ============================================
// Status Checks
// ============================================

export function isRalphReady(): { ready: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!isGmailConnected()) {
    issues.push('Gmail not connected');
  }

  if (!isAnthropicConfigured()) {
    issues.push('Anthropic API key not configured');
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}

export function getRalphStats() {
  const syncState = getSyncState();
  return {
    lastSync: syncState.lastSyncTime ? new Date(syncState.lastSyncTime) : null,
    totalEmailsProcessed: syncState.totalEmailsProcessed,
    totalTasksCreated: syncState.totalTasksCreated,
    lastError: syncState.lastError,
  };
}

export function clearRalphData(): void {
  localStorage.removeItem(SYNC_STATE_KEY);
  localStorage.removeItem(PROCESSED_EMAILS_KEY);
}
