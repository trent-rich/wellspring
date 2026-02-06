/**
 * Unified AI Service
 *
 * Routes all AI requests through a single Edge Function gateway
 * supporting multiple AI providers (Claude, GPT-4, Gemini).
 *
 * Supports per-action provider configuration for optimal results:
 * - Task Extraction → Claude (best at structured extraction)
 * - Prioritization → GPT-4 (good at reasoning)
 * - Artifact Creation → Claude (good at writing)
 * - Voice Response → Gemini (fast responses)
 */

// Type definitions
export type AIProvider = 'claude' | 'gpt4' | 'gemini';

export type AIAction = 'extract_tasks' | 'prioritize' | 'create_artifact' | 'voice_response';

export interface AIRequest {
  provider: AIProvider;
  action: AIAction;
  payload: Record<string, unknown>;
}

export interface AIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ActionProviderConfig {
  extract_tasks: AIProvider;
  prioritize: AIProvider;
  create_artifact: AIProvider;
  voice_response: AIProvider;
}

// Constants
const STORAGE_KEY = 'ai_providers'; // Changed to store per-action config
const EDGE_FUNCTION_PATH = '/functions/v1/ai-gateway';

// Default providers optimized for each action's requirements
const DEFAULT_ACTION_PROVIDERS: ActionProviderConfig = {
  extract_tasks: 'claude',      // Claude excels at structured extraction and following formats
  prioritize: 'gpt4',           // GPT-4 has strong reasoning capabilities
  create_artifact: 'claude',    // Claude produces high-quality written content
  voice_response: 'gemini',     // Gemini offers fast response times
};

const AVAILABLE_PROVIDERS: { id: AIProvider; name: string; description: string }[] = [
  { id: 'claude', name: 'Claude', description: 'Anthropic Claude AI' },
  { id: 'gpt4', name: 'GPT-4', description: 'OpenAI GPT-4' },
  { id: 'gemini', name: 'Gemini', description: 'Google Gemini AI' },
];

const ACTION_LABELS: Record<AIAction, { name: string; description: string }> = {
  extract_tasks: {
    name: 'Task Extraction',
    description: 'Extracting actionable tasks from emails and text'
  },
  prioritize: {
    name: 'Prioritization',
    description: 'Analyzing and ranking tasks by importance'
  },
  create_artifact: {
    name: 'Artifact Creation',
    description: 'Generating documents, drafts, and summaries'
  },
  voice_response: {
    name: 'Voice Response',
    description: 'Conversational responses for Ralph assistant'
  },
};

/**
 * Get the Supabase URL from environment variables
 */
function getSupabaseUrl(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL;
}

/**
 * Get the Supabase anonymous key from environment variables
 */
function getSupabaseAnonKey(): string | undefined {
  return import.meta.env.VITE_SUPABASE_ANON_KEY;
}

/**
 * Check if the AI service is properly configured
 * Verifies that Supabase URL is set
 */
export function isAIConfigured(): boolean {
  const supabaseUrl = getSupabaseUrl();
  return Boolean(supabaseUrl && supabaseUrl.length > 0);
}

/**
 * Get the provider configuration for all actions
 */
export function getActionProviders(): ActionProviderConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_ACTION_PROVIDERS };
  }

  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<ActionProviderConfig>;
      // Merge with defaults to ensure all actions have a provider
      return {
        ...DEFAULT_ACTION_PROVIDERS,
        ...parsed,
      };
    } catch {
      return { ...DEFAULT_ACTION_PROVIDERS };
    }
  }

  return { ...DEFAULT_ACTION_PROVIDERS };
}

/**
 * Get the provider for a specific action
 */
export function getProviderForAction(action: AIAction): AIProvider {
  const config = getActionProviders();
  return config[action] || DEFAULT_ACTION_PROVIDERS[action];
}

/**
 * Set the provider for a specific action
 */
export function setProviderForAction(action: AIAction, provider: AIProvider): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    console.warn('localStorage not available, provider selection will not persist');
    return;
  }

  if (!isValidProvider(provider)) {
    throw new Error(`Invalid AI provider: ${provider}. Must be one of: ${AVAILABLE_PROVIDERS.map(p => p.id).join(', ')}`);
  }

  const current = getActionProviders();
  current[action] = provider;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

/**
 * Set all action providers at once
 */
export function setActionProviders(config: Partial<ActionProviderConfig>): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    console.warn('localStorage not available, provider selection will not persist');
    return;
  }

  const current = getActionProviders();
  const updated = { ...current, ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Reset all providers to defaults
 */
export function resetToDefaultProviders(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ACTION_PROVIDERS));
}

/**
 * Get default provider configuration
 */
export function getDefaultProviders(): ActionProviderConfig {
  return { ...DEFAULT_ACTION_PROVIDERS };
}

// Legacy function for backward compatibility
export function getAIProvider(): AIProvider {
  // Return the extract_tasks provider as the "primary" for legacy code
  return getProviderForAction('extract_tasks');
}

// Legacy function for backward compatibility
export function setAIProvider(provider: AIProvider): void {
  // Set all actions to the same provider (legacy behavior)
  setActionProviders({
    extract_tasks: provider,
    prioritize: provider,
    create_artifact: provider,
    voice_response: provider,
  });
}

/**
 * Get the list of available AI providers
 */
export function getAvailableProviders(): { id: AIProvider; name: string; description: string }[] {
  return [...AVAILABLE_PROVIDERS];
}

/**
 * Get the list of available actions with labels
 */
export function getAvailableActions(): { id: AIAction; name: string; description: string }[] {
  return Object.entries(ACTION_LABELS).map(([id, info]) => ({
    id: id as AIAction,
    ...info,
  }));
}

/**
 * Validate if a string is a valid AI provider
 */
function isValidProvider(provider: string): provider is AIProvider {
  return AVAILABLE_PROVIDERS.some(p => p.id === provider);
}

/**
 * Make a request to the AI gateway Edge Function
 *
 * @param action - The AI action to perform
 * @param payload - Action-specific data
 * @returns The AI response
 */
export async function callAI<T = unknown>(
  action: AIAction,
  payload: Record<string, unknown>
): Promise<AIResponse<T>> {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl) {
    return {
      success: false,
      error: 'AI service not configured: VITE_SUPABASE_URL is not set',
    };
  }

  if (!supabaseAnonKey) {
    return {
      success: false,
      error: 'AI service not configured: VITE_SUPABASE_ANON_KEY is not set',
    };
  }

  // Get the provider configured for this specific action
  const provider = getProviderForAction(action);
  const url = `${supabaseUrl}${EDGE_FUNCTION_PATH}`;

  const requestBody: AIRequest = {
    provider,
    action,
    payload,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `AI request failed (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: `AI request failed: ${errorMessage}`,
    };
  }
}

/**
 * Helper function to extract tasks from text
 */
export async function extractTasks(text: string): Promise<AIResponse> {
  return callAI('extract_tasks', { text });
}

/**
 * Helper function to prioritize tasks
 */
export async function prioritizeTasks(tasks: unknown[]): Promise<AIResponse> {
  return callAI('prioritize', { tasks });
}

/**
 * Helper function to create an artifact
 */
export async function createArtifact(prompt: string, context?: Record<string, unknown>): Promise<AIResponse> {
  return callAI('create_artifact', { prompt, context });
}

/**
 * Helper function for voice response generation
 */
export async function generateVoiceResponse(input: string, conversationHistory?: unknown[]): Promise<AIResponse> {
  return callAI('voice_response', { input, conversationHistory });
}
