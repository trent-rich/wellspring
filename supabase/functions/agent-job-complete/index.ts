// Edge Function: Complete Agent Job
// POST /agent-job-complete
// Marks a job as completed or failed

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createSupabaseClient,
  corsHeaders,
  errorResponse,
  successResponse,
} from '../_shared/supabase.ts';

interface CompleteJobRequest {
  job_id: string;
  worker_id: string;
  status: 'completed' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
  artifacts?: Array<{
    artifact_type: string;
    title?: string;
    content?: string;
    content_json?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // Parse request body
    const body: CompleteJobRequest = await req.json();

    // Validate required fields
    if (!body.job_id) {
      return errorResponse('job_id is required');
    }
    if (!body.worker_id) {
      return errorResponse('worker_id is required');
    }
    if (!body.status || !['completed', 'failed'].includes(body.status)) {
      return errorResponse('status must be "completed" or "failed"');
    }

    let success: boolean;

    if (body.status === 'completed') {
      // Call the complete function
      const { data, error } = await supabase.rpc('complete_agent_job', {
        p_job_id: body.job_id,
        p_worker_id: body.worker_id,
        p_output: body.output ?? null,
      });

      if (error) {
        console.error('Error completing job:', error);
        return errorResponse(`Failed to complete job: ${error.message}`, 500);
      }

      success = data;

      // Create artifacts if provided
      if (success && body.artifacts && body.artifacts.length > 0) {
        const artifactsToInsert = body.artifacts.map((artifact) => ({
          artifact_type: artifact.artifact_type,
          title: artifact.title,
          content: artifact.content,
          content_json: artifact.content_json,
          job_id: body.job_id,
          metadata: artifact.metadata,
        }));

        const { error: artifactError } = await supabase
          .from('agent_artifacts')
          .insert(artifactsToInsert);

        if (artifactError) {
          console.error('Error creating artifacts:', artifactError);
          // Don't fail the whole request, just log
        }
      }

      // Log to audit
      await supabase.from('audit_log').insert({
        action: 'job_completed',
        entity_type: 'agent_job',
        entity_id: body.job_id,
        details: {
          worker_id: body.worker_id,
          artifacts_count: body.artifacts?.length ?? 0,
        },
      });

    } else {
      // Call the fail function
      const { data, error } = await supabase.rpc('fail_agent_job', {
        p_job_id: body.job_id,
        p_worker_id: body.worker_id,
        p_error: body.error ?? 'Unknown error',
      });

      if (error) {
        console.error('Error failing job:', error);
        return errorResponse(`Failed to fail job: ${error.message}`, 500);
      }

      success = data;

      // Log to audit
      await supabase.from('audit_log').insert({
        action: 'job_failed',
        entity_type: 'agent_job',
        entity_id: body.job_id,
        details: {
          worker_id: body.worker_id,
          error: body.error,
        },
      });
    }

    if (!success) {
      return errorResponse('Job not found, not locked by this worker, or already completed', 404);
    }

    // Fetch the updated job
    const { data: job, error: fetchError } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', body.job_id)
      .single();

    if (fetchError) {
      console.error('Error fetching job:', fetchError);
    }

    return successResponse({
      success: true,
      job,
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return errorResponse(`Unexpected error: ${err.message}`, 500);
  }
});
