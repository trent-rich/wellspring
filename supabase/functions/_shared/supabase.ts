// Shared Supabase client for Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Types for our database
export interface AgentJob {
  id: string;
  job_type: string;
  status: 'pending' | 'locked' | 'completed' | 'failed' | 'cancelled';
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

export interface EmailThread {
  id: string;
  gmail_thread_id: string;
  gmail_history_id?: string;
  subject: string;
  snippet?: string;
  participants?: { email: string; name?: string }[];
  status: 'new' | 'triaged' | 'action_required' | 'draft_ready' | 'responded' | 'archived' | 'snoozed';
  priority?: 'urgent' | 'high' | 'normal' | 'low' | 'fyi';
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

export interface AgentArtifact {
  id: string;
  artifact_type: string;
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

// Create Supabase client with service role for Edge Functions
export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Standard CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Standard error response
export function errorResponse(message: string, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Standard success response
export function successResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
