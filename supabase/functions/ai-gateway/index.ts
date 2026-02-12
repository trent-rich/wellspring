// Edge Function: AI Gateway
// POST /ai-gateway
// Routes AI requests to multiple providers (Claude, GPT-4, Gemini)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Standard CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Standard error response
function errorResponse(message: string, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Standard success response
function successResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// API URLs
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Types
type AIProvider = 'claude' | 'gpt4' | 'gemini';
type AIAction = 'extract_tasks' | 'prioritize' | 'create_artifact' | 'voice_response' | 'chat';

interface AIGatewayRequest {
  provider: AIProvider;
  action: AIAction;
  payload: Record<string, unknown>;
}

// Prompts for different actions
const PROMPTS: Record<AIAction, string> = {
  extract_tasks: `You are an AI assistant that extracts actionable tasks from text. Analyze the content and identify any tasks, action items, or requests that require attention.

For each task found, provide:
1. title: A concise task title (max 80 chars)
2. description: Brief description of what needs to be done
3. taskType: One of: "action", "email_reply", "document_create", "meeting_schedule", "review", "decision"
4. priority: 1 (urgent/important) to 5 (low priority)
5. dueDate: ISO date string if a deadline is mentioned (use today: {{TODAY}})
6. confidence: 0-1 score of how confident you are this is a real action item

Also assess:
- requiresReply: Does this need a response?
- replyUrgency: none/low/medium/high
- summary: One sentence summary

Respond ONLY with valid JSON matching this structure:
{
  "tasks": [{ "title": "string", "description": "string", "taskType": "string", "priority": number, "dueDate": "string or null", "confidence": number, "sourceContext": "relevant excerpt" }],
  "requiresReply": boolean,
  "replyUrgency": "none" | "low" | "medium" | "high",
  "summary": "string"
}`,

  prioritize: `You are an AI assistant that prioritizes tasks. Given a list of tasks, analyze them and return a prioritized ordering based on:
- Urgency and deadlines
- Business impact
- Dependencies between tasks
- Effort required

Respond ONLY with valid JSON:
{
  "prioritizedTasks": [{ "id": "string", "priority": number, "reason": "string" }],
  "recommendations": "string"
}`,

  create_artifact: `You are an AI assistant that creates professional documents and artifacts. Based on the given prompt and context, create the requested content.

Respond ONLY with valid JSON:
{
  "title": "string",
  "content": "string (the full artifact content)",
  "type": "email_draft" | "document" | "summary" | "analysis",
  "suggestions": ["string"]
}`,

  voice_response: `You are Ralph, an AI assistant for Wellspring - a task and email management system. Respond conversationally and helpfully to the user's input. Keep responses concise but informative.

Consider the conversation history provided for context.

Respond ONLY with valid JSON:
{
  "response": "string (your spoken response)",
  "actions": [{ "type": "string", "data": {} }],
  "followUp": "string or null"
}`
};

// Call Anthropic Claude API
async function callClaude(
  prompt: string,
  userContent: string,
  options?: { model?: string; max_tokens?: number; system?: string }
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = options?.model || 'claude-3-haiku-20240307';
  const max_tokens = options?.max_tokens || 2048;

  // For chat action, use system prompt separately; for structured actions, combine prompt + content
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens,
    messages: [{ role: 'user', content: options?.system ? userContent : `${prompt}\n\n---\n\n${userContent}` }],
  };
  if (options?.system) {
    requestBody.system = options.system;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.content?.[0]?.text || '';
}

// Call OpenAI GPT-4 API
async function callGPT4(prompt: string, userContent: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || '';
}

// Call Google Gemini API
async function callGemini(prompt: string, userContent: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${prompt}\n\n---\n\n${userContent}` }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Route request to appropriate provider
async function callAI(provider: AIProvider, prompt: string, userContent: string): Promise<string> {
  switch (provider) {
    case 'claude':
      return callClaude(prompt, userContent);
    case 'gpt4':
      return callGPT4(prompt, userContent);
    case 'gemini':
      return callGemini(prompt, userContent);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Build user content from payload based on action
function buildUserContent(action: AIAction, payload: Record<string, unknown>): string {
  switch (action) {
    case 'extract_tasks':
      if (payload.subject || payload.body) {
        // Email format
        return `From: ${payload.from || 'Unknown'}
Date: ${payload.date || 'Unknown'}
Subject: ${payload.subject || '(No Subject)'}

${payload.body || ''}`.trim();
      }
      return String(payload.text || '');

    case 'prioritize':
      return JSON.stringify(payload.tasks || [], null, 2);

    case 'create_artifact':
      return `Prompt: ${payload.prompt || ''}
${payload.context ? `\nContext: ${JSON.stringify(payload.context)}` : ''}`;

    case 'voice_response':
      let content = `User Input: ${payload.input || ''}`;
      if (payload.conversationHistory && Array.isArray(payload.conversationHistory)) {
        content = `Conversation History:\n${payload.conversationHistory.map((m: unknown) => {
          const msg = m as { role?: string; content?: string };
          return `${msg.role || 'unknown'}: ${msg.content || ''}`;
        }).join('\n')}\n\n${content}`;
      }
      return content;

    default:
      return JSON.stringify(payload);
  }
}

// Parse AI response to JSON
function parseAIResponse(response: string): unknown {
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse AI response as JSON');
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: AIGatewayRequest = await req.json();

    // Validate request
    if (!body.provider) {
      return errorResponse('provider is required');
    }
    if (!body.action) {
      return errorResponse('action is required');
    }
    if (!body.payload) {
      return errorResponse('payload is required');
    }

    // Validate provider
    if (!['claude', 'gpt4', 'gemini'].includes(body.provider)) {
      return errorResponse(`Invalid provider: ${body.provider}. Must be claude, gpt4, or gemini`);
    }

    // Validate action
    const validActions = ['extract_tasks', 'prioritize', 'create_artifact', 'voice_response', 'chat'];
    if (!validActions.includes(body.action)) {
      return errorResponse(`Invalid action: ${body.action}`);
    }

    // Handle 'chat' action — free-form system+user prompt passthrough
    if (body.action === 'chat') {
      const { system, message, model, max_tokens } = body.payload as {
        system?: string;
        message: string;
        model?: string;
        max_tokens?: number;
      };

      if (!message) {
        return errorResponse('payload.message is required for chat action');
      }

      const chatModel = model || 'claude-sonnet-4-20250514';
      const chatMaxTokens = max_tokens || 1024;

      const text = await callClaude('', message, {
        model: chatModel,
        max_tokens: chatMaxTokens,
        system: system || undefined,
      });

      return successResponse({ text });
    }

    // Get prompt and inject today's date
    const today = new Date().toISOString().split('T')[0];
    const prompt = PROMPTS[body.action].replace('{{TODAY}}', today);

    // Build user content
    const userContent = buildUserContent(body.action, body.payload);

    // Call AI provider
    const response = await callAI(body.provider, prompt, userContent);

    // Parse and return response
    const parsed = parseAIResponse(response);
    return successResponse(parsed);

  } catch (err) {
    console.error('AI Gateway error:', err);
    return errorResponse(`AI Gateway error: ${err.message}`, 500);
  }
});
