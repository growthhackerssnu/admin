# admin.ghsnu.com 포털 프론트

`admin.ghsnu.com` 루트 경험(로그인·가입·OTP 인증, 회원 관리)을 담당하는 React + TypeScript + Vite 앱이다. `apps/portal-backend`에 직접 연결된다.

대협봇(`/dh`, `apps/dh-frontend`)·그핵드인(`/hr`, 준비 중)의 업무 화면과는 분리돼 있다.

## 페이지

| 경로 | 내용 |
|---|---|
| `/`, `/login` | 같은 컴포넌트. 로그아웃 상태면 Google 로그인/가입(기수·이름·이메일) + OTP 인증 폼을 보여준다. 로그인된 세션으로 도달하면(Google OAuth의 `redirectTo`가 origin이라 `/`가 착지점이다) `GET /api/v1/me`로 role을 물어 있어야 할 곳으로 곧장 리다이렉트한다 |
| `/admin` | 회원 명단·권한 변경·삭제(비활성화)·재활성화. admin role만 접근(`GET /me`의 `role === "admin"`으로 판단) |

## 로그인 후 리다이렉트

`GET /api/v1/me`가 role에 따라 고정된 `redirectPath`를 내려준다 — admin→`/admin`(이 앱 안), acting→`/dh`, alumni→`/hr`. production에서는 gateway가 같은 `admin.ghsnu.com` origin 아래로 `/dh`, `/hr`을 rewrite하므로 상대 경로만으로 이동이 된다. **로컬 개발**에서는 각 앱이 서로 다른 포트에서 떠 있으므로, `.env.local`에 `VITE_DH_URL`/`VITE_HR_URL`을 절대 URL로 지정해야 실제로 이동한다(비워두면 프로덕션과 동일하게 상대 경로 `"/dh"`/`"/hr"`로 이동을 시도하고, 로컬 게이트웨이가 없으면 404가 난다 — 그 자체는 정상 동작이다. `.env.example` 참고).

## 준비

1. `npm install`(저장소 루트에서 — npm workspaces)
2. `.env.example`을 `.env.local`로 복사하고 값 채우기. Supabase 값은 `apps/portal-backend/.env.local`과 같은 프로젝트여야 한다
3. `npm run dev` — `http://127.0.0.1:5174`에서 실행(대협봇 프론트의 5173과 겹치지 않게 포트를 분리했다). **브라우저에서는 `http://localhost:5174`로 접속해야 한다** — 포털 백엔드의 CORS 허용 목록 기본값이 `localhost:5174`라, `127.0.0.1`로 접속하면 Origin이 달라 API 호출이 막힌다

## 로컬 전체 흐름 테스트

`apps/portal-backend`(3001)와 함께, 리다이렉트 목적지로 삼을 `apps/dh-frontend`(5173)도 같이 띄워야 admin/acting 로그인 후 이동까지 확인할 수 있다. hr은 아직 없으므로 alumni 리다이렉트(`/hr`)는 목적지가 없는 게 정상이다.
