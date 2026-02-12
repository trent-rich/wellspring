/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_MONDAY_API_TOKEN?: string;
  readonly VITE_MONDAY_GEODE_BOARD_ID?: string;
  readonly VITE_MONDAY_PAYMENTS_BOARD_ID?: string;
  readonly VITE_SLACK_DEFAULT_CHANNEL_ID?: string;
  readonly VITE_ENABLE_VOICE?: string;
  readonly VITE_ENABLE_MEETING_MONITORING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
