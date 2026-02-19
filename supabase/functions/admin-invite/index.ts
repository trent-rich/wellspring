// Edge Function: Admin User Invite
// POST /admin-invite
// Proxies Supabase admin operations to keep SERVICE_ROLE_KEY server-side

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function errorResponse(message: string, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function successResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

interface InviteRequest {
  email: string;
  role: string;
  redirectTo: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Supabase credentials not configured', 500);
    }

    // Verify the caller is authenticated by checking their JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('Authorization required', 401);
    }

    // Extract the token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');

    // Create admin client to verify the caller's JWT
    const adminVerifyClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: authError } = await adminVerifyClient.auth.getUser(token);
    if (authError || !caller) {
      console.error('JWT verification failed:', authError?.message);
      return errorResponse(`Invalid or expired token: ${authError?.message || 'unknown'}`, 401);
    }

    // Check if caller has admin role (use admin client to bypass RLS)
    const { data: callerProfile } = await adminVerifyClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return errorResponse('Admin role required', 403);
    }

    // Parse request
    const body: InviteRequest = await req.json();
    if (!body.email || !body.role) {
      return errorResponse('email and role are required');
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Invite user
    const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      body.email.trim(),
      {
        redirectTo: body.redirectTo || supabaseUrl,
        data: { role: body.role },
      }
    );

    if (inviteError) {
      return errorResponse(`Invite failed: ${inviteError.message}`, 500);
    }

    // Pre-create user profile
    if (data.user) {
      await adminClient.from('users').upsert({
        id: data.user.id,
        email: body.email.trim(),
        role: body.role,
        full_name: null,
      });
    }

    return successResponse({
      success: true,
      userId: data.user?.id,
      email: body.email,
      role: body.role,
    });

  } catch (err) {
    console.error('Admin invite error:', err);
    return errorResponse(`Unexpected error: ${err.message}`, 500);
  }
});
