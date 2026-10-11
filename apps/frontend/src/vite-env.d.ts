/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** 슬랙 백업(/slack) GH Export 앱의 Client ID. 백엔드 SLACK_EXPORT_CLIENT_ID와 같은 값. */
  readonly VITE_SLACK_EXPORT_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
