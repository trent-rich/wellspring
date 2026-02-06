// Types for the Agent system

export type JobStatus = 'pending' | 'locked' | 'completed' | 'failed' | 'cancelled';

export type JobType =
  | 'email_triage'
  | 'email_draft_reply'
  | 'email_summarize_thread'
  | 'research_web'
  | 'research_codebase'
  | 'research_document'
  | 'write_document'
  | 'write_email'
  | 'write_summary'
  | 'monitor_inbox'
  | 'monitor_calendar'
  | 'monitor_mentions';

export type ArtifactType =
  | 'email_draft'
  | 'document'
  | 'summary'
  | 'research_report'
  | 'classification'
  | 'extracted_tasks'
  | 'raw_output';

export type EmailPriority = 'urgent' | 'high' | 'normal' | 'low' | 'fyi';

export type EmailThreadStatus =
  | 'new'
  | 'triaged'
  | 'action_required'
  | 'draft_ready'
  | 'responded'
  | 'archived'
  | 'snoozed';

export interface AgentJob {
  id: string;
  job_type: JobType;
  status: JobStatus;
  priority: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  locked_by?: string;
  locked_at?: string;
  lock_expires_at?: string;
  parent_job_id?: string;
  source_email_id?: string;
  source_task_id?: string;
  created_by?: string;
  attempts: number;
  max_attempts: number;
  started_at?: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentArtifact {
  id: string;
  artifact_type: ArtifactType;
  title?: string;
  content?: string;
  content_json?: Record<string, unknown>;
  storage_path?: string;
  job_id?: string;
  email_id?: string;
  task_id?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  approved?: boolean;
  review_notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EmailThread {
  id: string;
  gmail_thread_id: string;
  gmail_history_id?: string;
  subject: string;
  snippet?: string;
  participants?: { email: string; name?: string }[];
  status: EmailThreadStatus;
  priority?: EmailPriority;
  category?: string;
  suggested_action?: string;
  assigned_to?: string;
  related_task_id?: string;
  message_count: number;
  unread_count: number;
  latest_message_at?: string;
  first_message_at?: string;
  snoozed_until?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  thread_id: string;
  subject?: string;
  from_address: string;
  from_name?: string;
  to_addresses?: { email: string; name?: string }[];
  cc_addresses?: { email: string; name?: string }[];
  body_text?: string;
  body_html?: string;
  snippet?: string;
  has_attachments: boolean;
  attachments?: { id: string; filename: string; mimeType: string; size: number }[];
  gmail_labels?: string[];
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  is_sent: boolean;
  internal_date: string;
  received_at?: string;
  headers?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

// Helper functions
export function getJobTypeLabel(type: JobType): string {
  const labels: Record<JobType, string> = {
    email_triage: 'Email Triage',
    email_draft_reply: 'Draft Reply',
    email_summarize_thread: 'Summarize Thread',
    research_web: 'Web Research',
    research_codebase: 'Codebase Research',
    research_document: 'Document Research',
    write_document: 'Write Document',
    write_email: 'Write Email',
    write_summary: 'Write Summary',
    monitor_inbox: 'Monitor Inbox',
    monitor_calendar: 'Monitor Calendar',
    monitor_mentions: 'Monitor Mentions',
  };
  return labels[type] || type;
}

export function getJobStatusColor(status: JobStatus): string {
  const colors: Record<JobStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    locked: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getArtifactTypeLabel(type: ArtifactType): string {
  const labels: Record<ArtifactType, string> = {
    email_draft: 'Email Draft',
    document: 'Document',
    summary: 'Summary',
    research_report: 'Research Report',
    classification: 'Classification',
    extracted_tasks: 'Extracted Tasks',
    raw_output: 'Raw Output',
  };
  return labels[type] || type;
}

export function getEmailPriorityColor(priority: EmailPriority): string {
  const colors: Record<EmailPriority, string> = {
    urgent: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    normal: 'bg-blue-100 text-blue-800',
    low: 'bg-gray-100 text-gray-800',
    fyi: 'bg-gray-50 text-gray-600',
  };
  return colors[priority] || 'bg-gray-100 text-gray-800';
}

export function getEmailThreadStatusColor(status: EmailThreadStatus): string {
  const colors: Record<EmailThreadStatus, string> = {
    new: 'bg-blue-100 text-blue-800',
    triaged: 'bg-yellow-100 text-yellow-800',
    action_required: 'bg-red-100 text-red-800',
    draft_ready: 'bg-purple-100 text-purple-800',
    responded: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800',
    snoozed: 'bg-orange-100 text-orange-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}
