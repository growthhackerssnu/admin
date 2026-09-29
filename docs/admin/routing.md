# admin.ghsnu.com 라우팅 구조

기준일: 2026-09-30. 배포 단위는 두 개다.

```
admin.ghsnu.com  (Vercel, apps/frontend — 단일 SPA, 라우터 하나)
  /  /login  /index  /admin        portal
  /dh  /dh/listup                  대협봇
  /hr  /hr/people/:id  /hr/requests  /hr/admin   그핵드인
  /nut                             NUT
        │  fetch + Authorization: Bearer <supabase access token>
        ▼
api.ghsnu.com    (Railway, apps/backend — Next.js API 전용)
  /api/auth/*  /api/v1/*  /api/inngest  /health
```

- **프론트**: 모든 화면이 `apps/frontend/src/main.tsx`의 라우트 하나에 들어 있다. 화면 간 이동(`SidePane`, 로그인 후 리다이렉트, 로그인 필요 시 `/login`)은 전부 React Router 내부 이동이라 새로고침이 없다. 루트 `vercel.json`이 모든 경로를 `index.html`로 돌린다(SPA fallback).
- **백엔드**: 접두사 없이 `/api/...`. 경로가 겹치던 두 곳만 이름을 바꿨다 — hr의 "내 정보"는 `/api/v1/people/me`(portal은 `/api/v1/me`), 쓰이지 않던 hr 스캐폴딩 `/api/v1/ping`은 삭제(nut의 `/api/v1/ping`만 남음).
- **CORS**: 프론트와 API가 다른 origin이므로 `apps/backend/middleware.ts`가 `https://admin.ghsnu.com`과 `http://localhost:5173`을 허용한다.

## 세션

Supabase 클라이언트는 `apps/frontend/src/lib/supabase.ts` 하나다. 세션은 `admin.ghsnu.com`의 localStorage에 있고, 로그인은 portal(`/login`)이 전담한다. 다른 화면은 세션이 없으면 `/login`으로 보낸다.

## 로그인 후 리다이렉트

`GET /api/v1/me`(portal)가 role별 `redirectPath`를 준다(`admin` → `/admin`, `acting` → `/dh`, `alumni` → `/hr`). alumni는 곧장 그리로, acting/admin은 `/index`(앱 선택)로 간다. role별 분기는 portal의 `Login` 한 곳에만 있다.

## 새 화면을 추가할 때

1. `apps/frontend/src/<name>/`에 코드를 두고 `src/main.tsx`에 `/<name>` 라우트를 추가한다(lazy import 권장).
2. 전역 선택자(`body`, `button` 등) CSS는 쓰지 않는다 — 한 페이지에 모든 화면의 CSS가 같이 로드된다. 필요하면 `:where(.scope) button`처럼 감싼다(`src/dh/listup/styles.css` 참고).
3. 역할별 이동 패널에 넣으려면 `packages/ui-shell/src/roleNav.ts`에 추가한다.
4. API는 `apps/backend/app/api/v1/...`, 업무 코드는 `apps/backend/src/<name>/`. 인증은 `@dhbot/auth`로 직접 검증한다(`src/hr/lib/auth.ts` 참고).
5. 테이블은 `packages/db/schema.prisma`에 추가하고 마이그레이션한다(`docs/db/conventions.md`).
