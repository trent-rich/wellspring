// Edge Function: Google Token Refresh
// POST /google-token-refresh
// Proxies Google OAuth token refresh to keep GOOGLE_CLIENT_SECRET server-side

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface TokenRefreshRequest {
  refresh_token: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return errorResponse('Google OAuth credentials not configured', 500);
    }

    const body: TokenRefreshRequest = await req.json();

    if (!body.refresh_token) {
      return errorResponse('refresh_token is required');
    }

    // Call Google's token endpoint with the client secret (kept server-side)
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: body.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const status = response.status === 400 ? 400 : 502;
      return errorResponse(
        `Google token refresh failed: ${err.error || response.statusText}`,
        status
      );
    }

    const data = await response.json();

    // Return only the fields the client needs (don't forward everything)
    return successResponse({
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
      token_type: data.token_type || 'Bearer',
    });

  } catch (err) {
    console.error('Google token refresh error:', err);
    return errorResponse(`Unexpected error: ${err.message}`, 500);
  }
});
