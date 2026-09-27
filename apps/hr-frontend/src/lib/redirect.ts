import { APP_PATH, type AppKey } from "@dhbot/ui-shell";

// side pane에서 다른 화면으로 이동할 때 실제로 쓰는 주소를 결정한다. 운영
// 환경에서는 상대 경로(APP_PATH)로 충분하지만(gateway가 같은 origin 아래로
// rewrite), 로컬 개발은 이 앱(5175)이 portal(5174)·dh(5173)와 다른 포트라
// 절대 URL로 덮어써야 한다 — portal-frontend/src/lib/redirect.ts와 같은 이유.
export function hrefForApp(app: AppKey): string {
  if (app === "admin" && import.meta.env.VITE_PORTAL_URL) {
    return `${import.meta.env.VITE_PORTAL_URL}/admin`;
  }
  if (app === "dh" && import.meta.env.VITE_DH_URL) {
    return import.meta.env.VITE_DH_URL;
  }
  return APP_PATH[app];
}

// hr엔 로그인 화면이 없다(portal 소유, ARCHITECTURE.md §3.1) — 세션이 없으면
// portal의 로그인 화면으로 보낸다.
export function loginHref(): string {
  return import.meta.env.VITE_PORTAL_URL
    ? `${import.meta.env.VITE_PORTAL_URL}/login`
    : "/login";
}
