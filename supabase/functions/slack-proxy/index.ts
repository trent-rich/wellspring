// Edge Function: Slack Proxy
// POST /slack-proxy
// Proxies Slack API calls to avoid CORS issues

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, errorResponse, successResponse } from '../_shared/supabase.ts';

const SLACK_API_URL = 'https://slack.com/api';

interface SlackProxyRequest {
  method: string; // Slack API method (e.g., 'chat.postMessage')
  body?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Slack bot token from environment
    const slackBotToken = Deno.env.get('SLACK_BOT_TOKEN');

    if (!slackBotToken) {
      return errorResponse('Slack bot token not configured', 500);
    }

    // Parse request body
    const body: SlackProxyRequest = await req.json();

    if (!body.method) {
      return errorResponse('method is required');
    }

    // Make request to Slack API
    const response = await fetch(`${SLACK_API_URL}/${body.method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${slackBotToken}`,
      },
      body: body.body ? JSON.stringify(body.body) : undefined,
    });

    if (!response.ok) {
      return errorResponse(`Slack API error: ${response.status} ${response.statusText}`, 500);
    }

    const result = await response.json();

    if (!result.ok) {
      return errorResponse(`Slack API error: ${result.error}`, 400);
    }

    return successResponse(result);

  } catch (err) {
    console.error('Unexpected error:', err);
    return errorResponse(`Unexpected error: ${err.message}`, 500);
  }
});
