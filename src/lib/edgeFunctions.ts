/**
 * Edge Function Client
 *
 * Shared utility for calling Supabase Edge Functions from the client.
 * All sensitive API keys (Anthropic, Google Client Secret, Supabase Service Role Key)
 * are stored as Supabase secrets and accessed only server-side via these Edge Functions.
 *
 * Safe to expose client-side: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ============================================
// GENERIC EDGE FUNCTION CALLER
// ============================================

async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  authToken?: string
): Promise<T> {
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken || SUPABASE_ANON_KEY}`,
  };

  // Also include apikey header for Supabase Edge Functions
  if (SUPABASE_ANON_KEY) {
    headers['apikey'] = SUPABASE_ANON_KEY;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || `Edge function ${functionName} failed: ${response.status}`);
  }

  return response.json();
}

// ============================================
// AI GATEWAY — Chat (free-form Claude calls)
// ============================================

interface AIChatResponse {
  text: string;
}

/**
 * Send a free-form chat message to Claude via the AI Gateway Edge Function.
 * Used by CommandBar and ai-drafts for general-purpose AI calls.
 *
 * @param message - The user message / prompt content
 * @param system - Optional system prompt
 * @param model - Claude model to use (default: claude-sonnet-4-20250514)
 * @param max_tokens - Max response tokens (default: 1024)
 */
export async function aiChat(
  message: string,
  options?: {
    system?: string;
    model?: string;
    max_tokens?: number;
  }
): Promise<string | null> {
  try {
    const result = await callEdgeFunction<AIChatResponse>('ai-gateway', {
      provider: 'claude',
      action: 'chat',
      payload: {
        message,
        system: options?.system,
        model: options?.model || 'claude-sonnet-4-20250514',
        max_tokens: options?.max_tokens || 1024,
      },
    });
    return result.text || null;
  } catch (err) {
    console.error('[edgeFunctions] AI chat error:', err);
    return null;
  }
}

// ============================================
// AI PROVIDER HEALTH CHECK
// ============================================

export interface AIProviderStatus {
  provider: string;
  name: string;
  connected: boolean;
  error?: string;
}

/**
 * Check if AI providers are reachable through the AI Gateway.
 * Sends a minimal test prompt to each configured provider.
 */
export async function checkAIProviderStatus(): Promise<AIProviderStatus[]> {
  const providers: { id: string; name: string }[] = [
    { id: 'claude', name: 'Anthropic Claude' },
    { id: 'gpt4', name: 'OpenAI GPT-4' },
    { id: 'gemini', name: 'Google Gemini' },
  ];

  const results = await Promise.allSettled(
    providers.map(async (p) => {
      const result = await callEdgeFunction<{ text?: string }>('ai-gateway', {
        provider: p.id,
        action: 'chat',
        payload: {
          message: 'Reply with just the word OK',
          max_tokens: 10,
        },
      });
      return { provider: p.id, name: p.name, connected: !!result.text };
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      provider: providers[i].id,
      name: providers[i].name,
      connected: false,
      error: r.reason?.message || 'Unknown error',
    };
  });
}

// ============================================
// GOOGLE TOKEN REFRESH
// ============================================

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Refresh a Google access token via the Edge Function.
 * The client secret is kept server-side — only the refresh token is sent.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<TokenRefreshResponse | null> {
  try {
    return await callEdgeFunction<TokenRefreshResponse>('google-token-refresh', {
      refresh_token: refreshToken,
    });
  } catch (err) {
    console.error('[edgeFunctions] Google token refresh error:', err);
    return null;
  }
}

// ============================================
// ADMIN INVITE
// ============================================

interface AdminInviteResponse {
  success: boolean;
  userId: string;
  email: string;
  role: string;
}

/**
 * Invite a user via the admin Edge Function.
 * The service role key is kept server-side — the caller's JWT is used for auth.
 *
 * @param email - Email to invite
 * @param role - Role to assign (admin, sequencing, geode)
 * @param redirectTo - OAuth redirect URL
 * @param userAccessToken - The caller's Supabase JWT token
 */
export async function adminInviteUser(
  email: string,
  role: string,
  redirectTo: string,
  userAccessToken: string
): Promise<AdminInviteResponse> {
  return callEdgeFunction<AdminInviteResponse>(
    'admin-invite',
    { email, role, redirectTo },
    userAccessToken
  );
}
