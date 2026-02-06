// Edge Function: Create Agent Job
// POST /agent-job-create
// Creates a new job in the agent job queue

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createSupabaseClient,
  corsHeaders,
  errorResponse,
  successResponse,
} from '../_shared/supabase.ts';

interface CreateJobRequest {
  job_type: string;
  input: Record<string, unknown>;
  priority?: number;
  parent_job_id?: string;
  source_email_id?: string;
  source_task_id?: string;
  metadata?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // Get user from auth header (optional - jobs can be created by system)
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }

    // Parse request body
    const body: CreateJobRequest = await req.json();

    // Validate required fields
    if (!body.job_type) {
      return errorResponse('job_type is required');
    }
    if (!body.input) {
      return errorResponse('input is required');
    }

    // Validate job_type is valid
    const validJobTypes = [
      'email_triage',
      'email_draft_reply',
      'email_summarize_thread',
      'research_web',
      'research_codebase',
      'research_document',
      'write_document',
      'write_email',
      'write_summary',
      'monitor_inbox',
      'monitor_calendar',
      'monitor_mentions',
    ];

    if (!validJobTypes.includes(body.job_type)) {
      return errorResponse(`Invalid job_type. Valid types: ${validJobTypes.join(', ')}`);
    }

    // Insert the job
    const { data: job, error } = await supabase
      .from('agent_jobs')
      .insert({
        job_type: body.job_type,
        input: body.input,
        priority: body.priority ?? 50,
        parent_job_id: body.parent_job_id,
        source_email_id: body.source_email_id,
        source_task_id: body.source_task_id,
        created_by: userId,
        metadata: body.metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job:', error);
      return errorResponse(`Failed to create job: ${error.message}`, 500);
    }

    // Log to audit
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'job_created',
      entity_type: 'agent_job',
      entity_id: job.id,
      details: {
        job_type: body.job_type,
        priority: body.priority ?? 50,
      },
    });

    return successResponse({
      success: true,
      job,
    }, 201);

  } catch (err) {
    console.error('Unexpected error:', err);
    return errorResponse(`Unexpected error: ${err.message}`, 500);
  }
});
