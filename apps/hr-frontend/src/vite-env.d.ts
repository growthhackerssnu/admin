/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_BASE_URL: string;
  // 로컬 개발 전용 — side pane·로그인 리다이렉트에서 다른 앱으로 이동할 때
  // 쓰는 절대 URL 오버라이드.
  readonly VITE_PORTAL_URL?: string;
  readonly VITE_DH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
