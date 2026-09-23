/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_BASE_URL: string;
  // 로컬 개발 전용 — production에선 비워둔다. gateway가 같은 origin 아래
  // /dh, /hr로 rewrite해주므로 상대 경로("/dh", "/hr")면 충분하지만, 로컬은
  // 앱마다 포트가 달라서 절대 URL로 오버라이드해야 실제로 이동할 수 있다.
  readonly VITE_DH_URL?: string;
  readonly VITE_HR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
