# admin.ghsnu.com 포털 백엔드

`admin.ghsnu.com` 루트 경험(로그인·가입·OTP 인증, 회원 관리)을 담당하는 Next.js(App Router, API 전용) 백엔드다. UI는 없다 — `apps/portal-frontend/`가 이 API를 호출하는 쪽이다.

대협봇(`/dh`, `apps/dh-backend`)·그핵드인(`/hr`, 준비 중)의 업무 로직과는 분리돼 있다. 이 앱은 "이 사람이 누구고, 로그인 후 어디로 보내야 하는지", "회원 명단·권한을 누가 관리하는지"만 안다.

## apps/dh-backend와 DB를 공유하는 방식

같은 Supabase Postgres를 `apps/dh-backend`와 함께 쓴다. **마이그레이션은 이 앱이 만들지 않는다** — 물리 스키마(테이블 구조)의 단일 소스는 `apps/dh-backend/prisma`(마이그레이션 이력을 갖고 있음)이고, 이 앱의 `prisma/schema.prisma`는 그 위에 얹힌 또 하나의 클라이언트 뷰다(`members`, `people_directory`, `signup_requests`, `idempotency_keys`만 선언 — 대협봇 업무 테이블은 모른다). 테이블 구조를 바꿔야 하면 `apps/dh-backend`에서 마이그레이션을 만들고, 이 스키마도 같이 갱신해야 한다.

`apps/dh-backend`도 `members` 테이블을 자기 스키마로 갖고 있다 — 자체 인증(`getAuthenticatedMember`)에 필요해서다. 두 앱의 `auth.ts`는 의도적으로 다르다: `apps/dh-backend`는 alumni를 완전히 막지만(그 백엔드는 `/dh` 전용), 이 앱은 **모든 role을 통과시킨다** — alumni도 로그인해서 `/me`로 자기 role을 알아야 `/hr`로 갈 수 있고, admin 화면 명단에도 나와야 하기 때문이다.

## 준비

1. `npm install`
2. `.env.example`을 `.env.local`로 복사하고 값 채우기 — `DATABASE_URL`/`DIRECT_URL`/`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`는 `apps/dh-backend/.env.local`과 동일한 값을 쓴다. `RESEND_API_KEY`도 마찬가지.
3. `npm run db:generate` — Prisma Client 생성(마이그레이션 아님, DB 구조는 `apps/dh-backend`가 이미 적용해뒀어야 함)
4. `npm run dev` — `http://localhost:3001`에서 API 실행(대협봇 백엔드의 3000과 겹치지 않게 포트를 분리했다)

## API

### 로그인 전(인증 불필요)

| API | 설명 |
|---|---|
| `POST /api/auth/signup-requests` | `{cohort, name, desiredEmail}` → `people_directory` 대조 → 매칭되면 그 사람의 노션 신뢰 이메일로 OTP 발송(Resend). `signupRequestId`와 마스킹된 발신 주소(`sentTo`) 응답 |
| `POST /api/auth/signup-requests/{id}/verify` | `{otp}` → 일치하면 `desiredEmail`로 `members` 행을 `role: alumni`로 생성, `people_directory.claimedByMemberId` 기록 |

노션 People DB → `people_directory` 동기화 자체(`npm run people:import`)는 `apps/dh-backend` 책임이다. 이 앱은 이미 동기화된 테이블만 읽는다.

### 인증 필요 (`Authorization: Bearer <Supabase access token>`)

| API | 설명 |
|---|---|
| `GET /api/v1/me` | `{userId, email, displayName, role, redirectPath}`. `redirectPath`는 role로 고정 결정(admin→`/admin`, acting→`/dh`, alumni→`/hr`) — 프론트가 로그인 직후 이 값으로만 리다이렉트하면 된다 |
| `GET /api/v1/admin/members` | (admin 전용) 전체 명단 — id, displayName, cohort, email, role, active, createdAt, lastLoginAt |
| `PATCH /api/v1/admin/members/role` | (admin 전용) `{memberIds, role: "acting"\|"alumni"}` — 일괄 role 변경. admin 대상 포함 시 전체 거부 |
| `POST /api/v1/admin/members/deactivate` | (admin 전용) `{memberIds}` — 일괄 비활성화("삭제", 실제 행은 안 지움). admin 대상·본인 계정 거부 |
| `POST /api/v1/admin/members/reactivate` | (admin 전용) `{memberIds}` — 비활성화를 되돌림 |

쓰기 API(role/deactivate/reactivate)는 `Idempotency-Key` 헤더가 필수다.

## 접근 제어

화이트리스트 방식(`members` 테이블) — Google 로그인 자체는 성공해도 `members`에 이메일이 없거나 `active: false`면 403이다. 등록은 위 가입 흐름으로 자동(`alumni`로) 되거나, `admin`이 관리자 API로 승격하거나, `apps/dh-backend`의 CLI(`npm run members:add`)로 수동 등록한다. `admin`으로의 승격은 API로 불가 — CLI로만.

## CORS

`middleware.ts`가 `/api/*` 전체에 적용된다. 기본 허용 출처는 로컬 포털 프론트(`http://localhost:5174`)와 운영(`https://admin.ghsnu.com`) — `.env.local`의 `ALLOWED_ORIGINS`(콤마 구분)로 추가 가능.
