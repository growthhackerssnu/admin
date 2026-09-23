# admin.ghsnu.com 라우팅 구조

기준일: 2026-09-23. `admin.ghsnu.com` 하나의 도메인 아래 여러 독립 앱(포털·대협봇·그핵드인)을 어떻게 나누고 연결하는지 정리한다. hr(그핵드인) 앱을 새로 만들 때 이 문서의 규칙을 따르면 된다.

## 전체 구조

```
                         admin.ghsnu.com
                                │
                          gateway (Vercel)
                     경로별 rewrite만 함, 자체 코드 없음
                                │
        ┌───────────────┬───────────────┬───────────────┐
        │                                               │
   "/", "/login/*"                                  "/dh/*"           "/hr/*"
   "/admin/*"                                           │                 │
        │                                        apps/dh-frontend   apps/hr-frontend
apps/portal-frontend                              (Vite, 5173)      (Vite, 준비 중)
   (Vite, 5174)                                         │                 │
        │                                        apps/dh-backend    apps/hr-backend
apps/portal-backend                              (Next.js, 3000)    (Next.js, 준비 중)
  (Next.js, 3001)
```

- **gateway**: `admin.ghsnu.com` 도메인을 소유하는 Vercel 프로젝트. 자체 코드가 없고 `vercel.json`의 `rewrites`로 경로별 트래픽을 각 앱의 배포로 그대로 넘긴다.
- **portal**(`apps/portal-frontend` + `apps/portal-backend`): 로그인·가입(OTP)·회원 관리(admin API)만 담당하는 계정/신원 도메인. `admin.ghsnu.com`의 루트 경험이다.
- **dh**(`apps/dh-frontend` + `apps/dh-backend`): 대협봇 업무 로직.
- **hr**(`apps/hr-frontend` + `apps/hr-backend`, 준비 중): 그핵드인(알럼나이 관리) 업무 로직.

각 앱은 독립된 Vercel 프로젝트로 배포된다(프로젝트마다 Root Directory를 `apps/xxx`로 지정). 코드 저장소만 하나로 모여 있을 뿐, 배포·스케일링·재시작은 완전히 분리돼 있다.

## rewrite 규칙

`gateway/vercel.json`이 갖고 있는 규칙(운영 URL은 각 앱을 실제로 배포한 뒤 채운다):

| 경로 | 대상 |
|---|---|
| `/`, `/login`, `/login/*` | `apps/portal-frontend` |
| `/admin`, `/admin/*` | `apps/portal-frontend`(의 `/admin` 라우트) |
| `/dh`, `/dh/*` | `apps/dh-frontend` |
| `/hr`, `/hr/*` | `apps/hr-frontend` (아직 배포 없음 — hr 앱을 만들면 여기에 추가) |

Vercel의 `rewrites`는 **redirect가 아니라 proxy**다 — 주소창의 URL은 안 바뀌고(`https://admin.ghsnu.com/dh`로 유지) 실제 응답만 다른 배포에서 가져온다. 이게 중요한 이유는 아래 "세션 공유" 항목에서 설명한다.

각 앱의 **내부 라우팅은 접두사를 모른다**: `apps/dh-frontend`의 React Router는 `/dh`가 아니라 그냥 `/`를 쓴다. gateway가 `/dh/foo` → `.../foo`로 접두사를 벗겨서 넘기기 때문이다. 새 앱을 추가할 때도 그 앱 자신은 자기가 어떤 경로 밑에 걸려 있는지 신경 쓸 필요가 없다.

## 로그인 후 리다이렉트

`GET /api/v1/me`(`apps/portal-backend`)가 role에 따라 고정된 `redirectPath`를 내려준다:

| role | redirectPath |
|---|---|
| `admin` | `/admin` (portal 안에 있음, 다른 앱으로 안 감) |
| `acting` | `/dh` |
| `alumni` | `/hr` |

`apps/portal-frontend`의 `Login`이 세션이 이미 있는 상태로 마운트되면(구글 OAuth의 `redirectTo`가 origin이라 `/`가 항상 이 착지점이다) `/me`를 호출해서 이 값으로 `window.location.href`를 바꾼다. **role별 분기 로직은 여기 한 곳에만 있다** — `dh`/`hr` 프론트는 "내가 acting/alumni 전용인지" 신경 쓰지 않는다(각자 API가 alumni를 차단하는 식으로 이미 막혀 있다).

## 세션 공유가 되는 이유

`apps/portal-frontend`, `apps/dh-frontend`, `apps/hr-frontend`는 서로 다른 Vercel 배포(다른 실제 origin)지만, gateway가 전부 `https://admin.ghsnu.com/*` 아래로 **proxy**하기 때문에 브라우저 입장에서는 전부 같은 origin이다. Supabase 세션(`supabase-js`가 `localStorage`에 저장)은 origin 단위로 격리되므로, 로그인 한 번으로 얻은 세션을 `/dh`, `/hr`, `/admin` 어디서나 그대로 쓸 수 있다. 각 앱이 별도 배포인데도 로그인 상태를 다시 확인할 필요가 없는 게 이 구조 덕분이다.

**주의**: 이건 gateway를 통해 접속했을 때만 성립한다. 로컬 개발처럼 각 앱을 서로 다른 포트(`localhost:5173`, `localhost:5174`)로 직접 열면 포트가 다른 순간 origin도 달라서 세션이 공유되지 않는다 — 아래 항목 참고.

## 로컬 개발: 포트 배정과 리다이렉트 오버라이드

로컬에는 gateway가 없다(굳이 `vercel dev`로 흉내 낼 수도 있지만 지금은 안 함). 각 앱을 서로 다른 포트로 띄우고, 포털의 role 리다이렉트만 절대 URL로 오버라이드해서 앱 간 이동을 확인한다.

| 앱 | 로컬 주소 |
|---|---|
| `apps/portal-frontend` | `http://localhost:5174` |
| `apps/portal-backend` | `http://localhost:3001` |
| `apps/dh-frontend` | `http://localhost:5173` |
| `apps/dh-backend` | `http://localhost:3000` |
| `apps/hr-frontend`(준비 중) | `http://localhost:5175` 권장 |
| `apps/hr-backend`(준비 중) | `http://localhost:3002` 권장 |

`apps/portal-frontend/.env.local`의 `VITE_DH_URL`/`VITE_HR_URL`을 채우면 로컬에서도 role별 리다이렉트가 실제로 그 포트로 이동한다(비워두면 프로덕션과 동일하게 상대 경로 `"/dh"`/`"/hr"`로 이동을 시도하고, 로컬엔 그 경로가 없으니 빈 화면이 뜬다 — 그 자체는 정상이다). `apps/dh-frontend/.env.example`, `apps/portal-frontend/.env.example`에 각 앱의 `ALLOWED_ORIGINS`/CORS 기본값도 이 포트 기준으로 맞춰져 있다.

로컬에서는 앱마다 origin(포트)이 달라서 세션이 자동으로 안 넘어간다 — 예를 들어 `localhost:5174`에서 로그인해도 `localhost:5173`은 로그인 안 된 상태다. 지금은 `apps/dh-frontend`가 아직 인증을 요구하는 화면이 없어서(목업만 있음) 문제가 안 되지만, 나중에 dh/hr이 실제로 `/api/v1/me` 같은 걸 불러야 하면 로컬 통합 테스트에 한계가 있다는 뜻이다. 필요해지면 `vercel dev` 기반 로컬 게이트웨이를 검토한다.

## hr 앱을 만들 때 지켜야 할 것

1. **`apps/hr-frontend`(Vite)와 `apps/hr-backend`(Next.js, API 전용)를 이 저장소의 `apps/` 밑에 만든다** — `apps/dh-frontend`/`apps/dh-backend` 구조를 그대로 참고한다.
2. **hr-frontend의 내부 라우팅은 `/hr` 접두사를 모르게 짠다** — gateway가 벗겨준다(위 참고).
3. **hr-backend가 로그인/회원 여부를 확인해야 하면, `apps/portal-backend`가 아니라 자기 자신의 `members` 조회로 인증한다** — `apps/dh-backend/src/lib/auth.ts`의 `getAuthenticatedMember` 패턴을 그대로 가져다 쓴다(Supabase 토큰 검증 + `members` 화이트리스트 확인). `apps/portal-backend`를 호출해서 인증을 위임하지 않는다 — 그러면 hr이 portal에 강하게 결합된다. 대신 `alumni`도 통과시켜야 한다(hr은 alumni 전용이 아니라 alumni "도" 볼 수 있는 화면이다 — 정확한 hr 권한 범위는 아직 미정, `docs/admin/README.md` 참고).
4. **DB는 `apps/dh-backend`처럼 자체 Prisma 스키마를 새로 만들되, `members` 등 공유 테이블은 마이그레이션하지 않는다** — `apps/portal-backend/prisma/schema.prisma`처럼 트림된 클라이언트 뷰로 선언하고, `output`을 앱 로컬 경로(`../src/generated/prisma`)로 지정한다. npm workspaces가 `@prisma/client`를 hoist해서 스키마가 다른 두 백엔드가 서로의 생성된 클라이언트를 덮어쓰는 문제가 있었다(이번 포털 분리 때 실제로 겪음) — 반드시 앱마다 `output`을 분리한다.
5. **CORS**: `apps/hr-backend/middleware.ts`의 `ALLOWED_ORIGINS` 기본값에 `http://localhost:5175`(로컬)와 `https://admin.ghsnu.com`(운영)을 넣는다.
6. **gateway 등록**: `gateway/vercel.json`에 `/hr`, `/hr/:path*` → hr-frontend 배포 URL rewrite를 추가한다(지금은 TODO placeholder로 이미 자리만 있다).
7. **포털과의 관계**: hr은 로그인·가입·회원 관리를 직접 구현하지 않는다 — 전부 `apps/portal-frontend`/`apps/portal-backend`가 이미 처리한 뒤 로그인된 세션(같은 origin이라 공유됨)만 갖고 hr에 도착한다. hr은 "이미 로그인된 사람이 왔다"고 가정하고 자기 API에서 그 세션을 검증하기만 하면 된다.

## 참고

- [게이트웨이 README](../../gateway/README.md)
- [포털 백엔드 README](../../apps/portal-backend/README.md), [포털 프론트 README](../../apps/portal-frontend/README.md)
- [설계·정책·연동 제안](README.md)
