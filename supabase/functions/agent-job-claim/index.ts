// Edge Function: Claim Agent Job
// POST /agent-job-claim
// Claims a job from the queue for processing (atomic lock)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createSupabaseClient,
  corsHeaders,
  errorResponse,
  successResponse,
} from '../_shared/supabase.ts';

interface ClaimJobRequest {
  worker_id: string;
  job_types?: string[];
  lock_duration_seconds?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // Parse request body
    const body: ClaimJobRequest = await req.json();

    // Validate required fields
    if (!body.worker_id) {
      return errorResponse('worker_id is required');
    }

    // Call the claim function
    const { data, error } = await supabase.rpc('claim_agent_job', {
      p_worker_id: body.worker_id,
      p_job_types: body.job_types ?? null,
      p_lock_duration_seconds: body.lock_duration_seconds ?? 300,
    });

    if (error) {
      console.error('Error claiming job:', error);
      return errorResponse(`Failed to claim job: ${error.message}`, 500);
    }

    // If no job was claimed, return empty result
    if (!data) {
      return successResponse({
        success: true,
        job: null,
        message: 'No pending jobs available',
      });
    }

    // Fetch the full job details
    const { data: job, error: fetchError } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) {
      console.error('Error fetching claimed job:', fetchError);
      return errorResponse(`Failed to fetch job details: ${fetchError.message}`, 500);
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
