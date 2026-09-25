# 대협 어드민 백엔드

`docs/admin/api-contract.md`의 API 계약을 구현하는 Next.js(App Router, API 전용) 백엔드다. UI는 없다 — `apps/dh-frontend/`가 이 API를 호출하는 쪽이다.

## 스택

Next.js 14 (App Router, Route Handlers만 사용) · Prisma + Supabase Postgres · Supabase Auth(Google OAuth) · Inngest(비동기 작업) · OpenAI API(리서치·초안 생성, Phase 3에서 사용) · Vercel 배포.

## 준비

1. `npm install`
2. `.env.example`을 `.env.local`로 복사하고 값 채우기:
   - Supabase 프로젝트의 `DATABASE_URL`(Transaction pooler, 6543)/`DIRECT_URL`(**Session pooler**, 5432 — 대시보드의 "Direct connection" 탭 값이 아니다. 그건 IPv6 전용이라 일반 네트워크에서 `prisma migrate`가 "Can't reach database server"로 막힌다), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY` — Phase 3(리서치·초안 생성)부터 필요, 지금 당장은 비워둬도 됨
   - `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` — 로컬 개발은 비워도 됨
3. 스키마가 최신인지 확인 — 마이그레이션은 이 앱이 아니라 `packages/db`가 소유한다(`cd ../../packages/db && npm run db:status`). 자세한 규칙은 [DB 공유 규칙](../../docs/db/conventions.md) §7
4. `npm run db:seed` — `apps/dh-frontend/src/mocks/fixtures.ts`의 샘플 8개 기업을 그대로 시딩
5. `npm run dev` — `http://localhost:3000`에서 API 실행

`db:seed`는 `dotenv-cli`로 `.env.local`을 로드한다(`prisma` CLI와 `tsx` 둘 다 `.env.local`을 자동으로 읽지 않기 때문 — `npm run dev`의 `next dev`만 자동으로 읽는다). 새 스크립트를 추가할 때도 이 패턴을 따른다.

## 역할(Role)

`admin.ghsnu.com` 전체(대협봇 dh + hr + 포털)에 걸친 권한이며, 이 저장소는 그중 `/dh`(대협봇)만 담당한다. 로그인·가입·회원 관리(admin API)는 `apps/portal-backend` 책임이다.

| role | 범위 |
|---|---|
| `admin` | `admin@ghsnu.com` 고정 하나. 전 영역 접근·편집, 회원 role 변경/삭제(`apps/portal-backend`의 관리자 API로) |
| `acting` | 현재 액팅 회원. dh+hr 업무 권한 전부 동일(PM 서브권한 없음 — 차수 시작도 누구나) |
| `alumni` | 가입한 알럼나이. **`/dh`(이 백엔드) 접근 자체가 막힌다** — `getAuthenticatedMember`가 곧바로 403. hr은 보기 전용(이 저장소 범위 밖) |

가입 직후에는 **무조건 `alumni`로 등록된다.** `people_directory`는 "이 사람이 진짜 명단에 있는 사람인지"만 확인하는 용도이고, 거기엔 액팅/알럼나이 구분이 없다 — admin이 `apps/portal-backend`의 관리자 API로 개별/일괄로 `acting`으로 승격시킨다. `admin`으로의 승격은 API로 불가 — 수동(CLI)으로만.

## 이 앱이 더 이상 하지 않는 것

`core` 스키마(회원·신원)는 `apps/portal-backend` 소유다([DB 공유 규칙](../../docs/db/conventions.md) §4). 그 테이블을 쓰던 CLI는 전부 그쪽으로 옮겼다.

| 하던 일 | 지금 위치 |
|---|---|
| 노션 People DB 동기화 (`people:import`) | `apps/portal-backend` |
| 회원 등록·회수 (`members:add` / `members:remove`) | `apps/portal-backend` |
| 마이그레이션 생성·적용 | `packages/db` |

이 앱은 `core.members`를 **읽기만** 한다(요청마다 "이 사람이 명단에 있나" 확인). `role`이나 `active`를 바꾸는 코드는 갖지 않는다.

## 인증·접근 권한

모든 `/api/v1/*` 요청은 `Authorization: Bearer <Supabase access token>` 헤더가 필요하다. 토큰은 Supabase Auth(Google OAuth)로 로그인한 뒤 발급받는다 — 이 백엔드 자체는 로그인 화면을 제공하지 않는다(`apps/portal-frontend`가 로그인·가입 UI를, Supabase 클라이언트가 OAuth 플로우를 처리한다).

**접근은 화이트리스트 방식이다.** 학회원 계정 도메인이 `ghsnu.com`/`gmail.com`/`snu.ac.kr` 등으로 섞여 있어 도메인 검사로는 거를 수 없다. Google OAuth 동의 화면은 **External**로 설정한다(Internal은 단일 Workspace 도메인 소속 계정만 로그인 자체가 가능해서, 도메인이 섞인 이 상황과 맞지 않는다). 로그인 자체는 어떤 Google 계정이든 시도할 수 있지만, `members` 테이블(대협봇 자체 DB 테이블, Supabase Auth의 사용자 목록과는 별개다)에 이메일이 등록돼 있지 않으면 접근이 403으로 막힌다. 보통은 가입 흐름으로 자동 등록되고, admin이나 예외 케이스만 수동으로 등록한다 — **`apps/portal-backend`에서** 실행한다:

```sh
cd ../portal-backend
npm run members:add -- person@ghsnu.com "표시 이름" admin   # 등록 (role 생략 시 acting)
npm run members:remove -- person@ghsnu.com                  # 회수 (행은 남기고 비활성화만)
```

이 사람이 처음 로그인하는 순간 Supabase user id가 자동으로 연결된다.

## CORS

`middleware.ts`가 `/api/*` 전체에 적용된다. 기본 허용 출처는 로컬 프론트(`http://localhost:5173`)와 운영(`https://admin.ghsnu.com`) — 다른 출처를 추가하려면 `.env.local`에 `ALLOWED_ORIGINS`(콤마 구분)를 지정한다. 라우트별로 따로 설정할 필요 없다.

## 구현 범위

- **완료(Phase 1)**: 조회 10종(`GET /cycles, /search-options, /companies, /companies/{id}, /outreaches/{id}, /outreaches/{id}/contacts, /companies/{id}/history, /sends/{id}, /template-bindings, /members`). `GET /me`와 회원 관리 API는 `apps/portal-backend`로 옮겼다
- **완료(Phase 2)**: 검토·수신자·초안·응답 쓰기 9종 — `POST /outreaches/{id}/approval`, `/skip`, `POST /companies/{id}/exclusion`, `PUT /outreaches/{id}/recipient`, `POST /outreaches/{id}/recipient-review`, `GET·PATCH /drafts/{outreachId}`, `POST /drafts/{outreachId}/approval`, `POST /outreaches/{id}/draft-review`, `POST /outreaches/{id}/response-checks`. 전부 `Idempotency-Key` 필수 + 낙관적 락(`expectedVersion`/`expectedRevision`) 적용
- **다음(Phase 3)**: 차수 시작·탐색, 관계자 탐색, 초안 생성 — Inngest 비동기 작업
- **다음(Phase 4)**: 발송은 수동 기록(`manual-send-records`)만. 시스템이 직접 이메일을 보내는 기능은 범위 밖이다.
- **범위 밖**: 소싱·수집 파이프라인(뉴스레터 → 기업 후보), 수주 확정, Notion 동기화 — `docs/admin/integration/05_데이터 모델 제안.md`와 `docs/admin/api-contract.md` §12 참고.

`api-contract.md`와 다르게 구현한 지점: **draftId는 별도 엔티티가 아니라 outreachId를 그대로 쓴다** — 우리 스키마는 outreach당 초안 스레드가 하나뿐이고(`message_draft_revisions`는 리비전 이력일 뿐), 계약 문서의 "draftId + revision" 중 draftId에 대응하는 안정적인 식별자가 outreachId다.

## 참고 문서

- [API 계약](../../docs/admin/api-contract.md)
- [데이터 모델](../../docs/admin/integration/05_데이터%20모델%20제안.md)
- [정책·확정 규칙](../../docs/admin/policies.md), [업무 흐름](../../docs/admin/workflow.md)
- [프론트 연결 지점](../dh-frontend/README.md) — `apps/dh-frontend/src/services/liveRepository.ts`(아직 없음)가 이 API를 호출하도록 `apps/dh-frontend/src/main.tsx`에서 조립해야 한다. 프론트의 한국어 Stage enum ↔ 이 API의 영문 코드 변환은 그 어댑터의 책임이며 이 백엔드의 범위는 아니다.
- [포털 백엔드](../portal-backend/README.md) — 로그인·가입·회원 관리(admin API)는 여기서 담당한다.
