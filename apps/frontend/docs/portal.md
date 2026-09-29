# 포털 화면 (`src/portal`)

`admin.ghsnu.com`의 루트 경험 — 로그인·가입(OTP)·앱 선택·회원 관리. API는 `apps/backend`의 portal 도메인([backend/docs/portal.md](../../backend/docs/portal.md))을 호출한다. 실행·환경 변수·배포는 [apps/frontend/README.md](../README.md).

## 페이지

| 경로 | 파일 | 내용 |
|---|---|---|
| `/`, `/login` | `pages/Login.tsx` | 로그아웃 상태면 Google 로그인 / 가입(기수·이름·이메일 → OTP) 폼. 로그인된 세션으로 도달하면(Google OAuth `redirectTo`가 origin이라 `/`가 착지점) `GET /api/v1/me`로 role을 물어 이동한다 |
| `/index` | `pages/Index.tsx` | admin·acting이 갈 곳을 고르는 화면. 목록은 `@dhbot/ui-shell`의 `reachableApps()` |
| `/admin` | `pages/AdminMembers.tsx` | 회원 명단·권한(운영팀 직책 포함) 변경·비활성화·재활성화. admin만 |

## 로그인 후 이동

- alumni → `me.redirectPath`(`/hr`)로 곧장.
- admin·acting → `/index`에서 고른다. admin은 관리자·대협봇·그핵드인·NUT, acting은 대협봇·그핵드인·NUT.

전부 React Router 내부 이동이라 새로고침이 없다. 다른 화면(dh·hr·nut)은 세션이 없으면 `/login`으로 보낸다. 로그인·로그아웃·세션은 `src/lib/supabase.ts`, `src/lib/useSession.ts`를 앱 전체가 같이 쓴다.

## 파일

| 파일 | 내용 |
|---|---|
| `lib/api.ts` | portal API 클라이언트(`getMe`, 가입 신청·OTP 검증, 회원 관리) |
| `pages/*.tsx` | 위 표의 화면 |
