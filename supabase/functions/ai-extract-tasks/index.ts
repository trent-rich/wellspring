// Edge Function: AI Task Extraction
// POST /ai-extract-tasks
// Uses Claude to extract actionable tasks from email content

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, errorResponse, successResponse } from '../_shared/supabase.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface ExtractTasksRequest {
  subject: string;
  body: string;
  from: string;
  date: string;
}

const EXTRACTION_PROMPT = `You are an AI assistant that extracts actionable tasks from emails. Analyze the email and identify any tasks, action items, or requests that require attention.

For each task found, provide:
1. title: A concise task title (max 80 chars)
2. description: Brief description of what needs to be done
3. taskType: One of: "action", "email_reply", "document_create", "meeting_schedule", "review", "decision"
4. priority: 1 (urgent/important) to 5 (low priority) based on:
   - Explicit urgency indicators
   - Sender importance
   - Deadlines mentioned
   - Business impact
5. dueDate: ISO date string if a deadline is mentioned or implied (use today's date as reference: {{TODAY}})
6. confidence: 0-1 score of how confident you are this is a real action item

Also assess:
- requiresReply: Does this email need a response?
- replyUrgency: none/low/medium/high
- summary: One sentence summary of the email

Respond ONLY with valid JSON matching this structure:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "taskType": "string",
      "priority": number,
      "dueDate": "string or null",
      "confidence": number,
      "sourceContext": "relevant excerpt from email"
    }
  ],
  "requiresReply": boolean,
  "replyUrgency": "none" | "low" | "medium" | "high",
  "summary": "string"
}

If no actionable tasks are found, return an empty tasks array.`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!anthropicApiKey) {
      return errorResponse('Anthropic API key not configured', 500);
    }

    const body: ExtractTasksRequest = await req.json();

    if (!body.subject && !body.body) {
      return errorResponse('subject or body is required');
    }

    const today = new Date().toISOString().split('T')[0];
    const prompt = EXTRACTION_PROMPT.replace('{{TODAY}}', today);

    const emailContent = `
From: ${body.from || 'Unknown'}
Date: ${body.date || 'Unknown'}
Subject: ${body.subject || '(No Subject)'}

${body.body || ''}
`.trim();

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\n---\n\nEmail to analyze:\n\n${emailContent}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return errorResponse(`Anthropic API error: ${response.status}`, 500);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text;

    if (!content) {
      return errorResponse('No response from AI', 500);
    }

    // Parse the JSON response
    try {
      const parsed = JSON.parse(content);
      return successResponse(parsed);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return successResponse(parsed);
      }
      return errorResponse('Failed to parse AI response', 500);
    }

  } catch (err) {
    console.error('Unexpected error:', err);
    return errorResponse(`Unexpected error: ${err.message}`, 500);
  }
});
