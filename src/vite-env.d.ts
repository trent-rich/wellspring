/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_ENABLE_VOICE?: string;
  readonly VITE_ENABLE_MEETING_MONITORING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
