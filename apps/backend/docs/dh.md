# dh 도메인 (대협봇)

`docs/admin/api-contract.md`의 API 계약 구현. 코드는 `src/dh`, 라우트는 `app/api/v1/...`와 Inngest `app/api/inngest`. 화면은 [frontend/docs/dh.md](../../frontend/docs/dh.md). 실행·환경 변수·배포는 [apps/backend/README.md](../README.md).

## 스택

Next.js 14 (App Router, Route Handlers만 사용) · Prisma + Supabase Postgres · Supabase Auth(Google OAuth) · Inngest(비동기 작업) · Gemini API(리서치·초안 생성) · Railway 배포(서버 전체가 하나).

## 준비

1. 서버 공통 설정은 [apps/backend/README.md](../README.md). dh에 필요한 값: `GEMINI_API_KEY`(리서치·초안 생성), `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`(로컬은 비워도 됨), 선택 `LISTUP_*`.
   - `DIRECT_URL`은 **Session pooler**(5432)다 — 대시보드의 "Direct connection" 탭 값은 IPv6 전용이라 일반 네트워크에서 `prisma migrate`가 "Can't reach database server"로 막힌다.
2. 스키마가 최신인지 확인 — 마이그레이션은 `packages/db`가 소유한다(`cd packages/db && npm run db:status`). 규칙은 [DB 공유 규칙](../../../docs/db/conventions.md) §7
3. `npm run db:seed -w apps/backend` — `apps/frontend/src/dh/mocks/fixtures.ts`의 샘플 8개 기업을 그대로 시딩
4. 비동기 작업이 필요하면 `npm run dev:inngest -w apps/backend`(Inngest dev 서버 → `http://localhost:3000/api/inngest`)

`db:seed`는 `dotenv-cli`로 `.env.local`을 로드한다(`prisma` CLI와 `tsx` 둘 다 `.env.local`을 자동으로 읽지 않기 때문 — `npm run dev`의 `next dev`만 자동으로 읽는다). 새 스크립트를 추가할 때도 이 패턴을 따른다.

## 역할(Role)

`admin.ghsnu.com` 전체에 걸친 권한이다. 로그인·가입·회원 관리(admin API)는 portal 도메인 책임이다.

| role | 범위 |
|---|---|
| `admin` | `admin@ghsnu.com` 고정 하나. 전 영역 접근·편집, 회원 role 변경/삭제(portal의 관리자 API로) |
| `acting` | 현재 액팅 회원. dh·hr·NUT 업무 권한 전부 동일(PM 서브권한 없음 — 차수 시작도 누구나) |
| `alumni` | 가입한 알럼나이. **dh API 접근 자체가 막힌다** — `src/dh/lib/auth.ts`의 `getAuthenticatedMember`가 곧바로 403. hr은 사용 가능, NUT은 불가 |

가입 직후에는 **무조건 `alumni`로 등록된다.** `people_directory`는 "이 사람이 진짜 명단에 있는 사람인지"만 확인하는 용도이고, 거기엔 액팅/알럼나이 구분이 없다 — admin이 portal의 관리자 API로 개별/일괄로 `acting`으로 승격시킨다. `admin`으로의 승격은 API로 불가 — 수동(CLI)으로만.

## dh가 하지 않는 것

`core` 스키마(회원·신원)는 portal 소유다([DB 공유 규칙](../../../docs/db/conventions.md) §4). 노션 People DB 동기화(`people:import`)와 회원 등록·회수(`members:add`/`members:remove`) 스크립트는 `scripts/portal/`, 마이그레이션은 `packages/db`에 있다.

dh 코드는 `core.members`를 **읽기만** 한다(요청마다 "이 사람이 명단에 있나" 확인). `role`이나 `active`를 바꾸는 코드는 갖지 않는다.

## 인증·접근 권한

모든 `/api/v1/*` 요청은 `Authorization: Bearer <Supabase access token>` 헤더가 필요하다. 토큰은 Supabase Auth(Google OAuth)로 로그인한 뒤 발급받는다 — 백엔드는 로그인 화면을 제공하지 않는다(프론트의 `/login`이 로그인·가입 UI를, Supabase 클라이언트가 OAuth 플로우를 처리한다).

**접근은 화이트리스트 방식이다.** 학회원 계정 도메인이 `ghsnu.com`/`gmail.com`/`snu.ac.kr` 등으로 섞여 있어 도메인 검사로는 거를 수 없다. Google OAuth 동의 화면은 **External**로 설정한다(Internal은 단일 Workspace 도메인 소속 계정만 로그인 자체가 가능해서, 도메인이 섞인 이 상황과 맞지 않는다). 로그인 자체는 어떤 Google 계정이든 시도할 수 있지만, `members` 테이블(대협봇 자체 DB 테이블, Supabase Auth의 사용자 목록과는 별개다)에 이메일이 등록돼 있지 않으면 접근이 403으로 막힌다. 보통은 가입 흐름으로 자동 등록되고, admin이나 예외 케이스만 수동으로 등록한다 — 저장소 루트에서 실행한다:

```sh
npm run members:add -w apps/backend -- person@ghsnu.com "표시 이름" admin   # 등록 (acting이면 운영팀 직책 인자 필수)
npm run members:remove -w apps/backend -- person@ghsnu.com                  # 회수 (행은 남기고 비활성화만)
```

이 사람이 처음 로그인하는 순간 Supabase user id가 자동으로 연결된다.

## CORS

서버 공통 `middleware.ts`가 `/api/*` 전체에 적용된다. 기본 허용 출처는 로컬 프론트(`http://localhost:5173`)와 운영(`https://admin.ghsnu.com`) — `ALLOWED_ORIGINS`(콤마 구분)로 덮어쓴다. 라우트별로 따로 설정할 필요 없다.

## 구현 범위

- **완료(Phase 1)**: 조회 10종(`GET /cycles, /search-options, /companies, /companies/{id}, /outreaches/{id}, /outreaches/{id}/contacts, /companies/{id}/history, /sends/{id}, /template-bindings, /members`). `GET /me`와 회원 관리 API는 portal 도메인에 있다
- **완료(Phase 2)**: 검토·수신자·초안·응답 쓰기 9종 — `POST /outreaches/{id}/approval`, `/skip`, `POST /companies/{id}/exclusion`, `PUT /outreaches/{id}/recipient`, `POST /outreaches/{id}/recipient-review`, `GET·PATCH /drafts/{outreachId}`, `POST /drafts/{outreachId}/approval`, `POST /outreaches/{id}/draft-review`, `POST /outreaches/{id}/response-checks`. 전부 `Idempotency-Key` 필수 + 낙관적 락(`expectedVersion`/`expectedRevision`) 적용
- **다음(Phase 3)**: 차수 시작·탐색, 관계자 탐색, 초안 생성 — Inngest 비동기 작업
- **다음(Phase 4)**: 발송은 수동 기록(`manual-send-records`)만. 시스템이 직접 이메일을 보내는 기능은 범위 밖이다.
- **범위 밖**: 소싱·수집 파이프라인(뉴스레터 → 기업 후보), 수주 확정, Notion 동기화 — `docs/admin/integration/05_데이터 모델 제안.md`와 `docs/admin/api-contract.md` §12 참고.

`api-contract.md`와 다르게 구현한 지점: **draftId는 별도 엔티티가 아니라 outreachId를 그대로 쓴다** — 우리 스키마는 outreach당 초안 스레드가 하나뿐이고(`message_draft_revisions`는 리비전 이력일 뿐), 계약 문서의 "draftId + revision" 중 draftId에 대응하는 안정적인 식별자가 outreachId다.

## 수주 회차·연락 이력 (human-review 계열)

팀장·관리자(`requireExternalLead`)가 목표 분기를 정하면 수주 회차가 시작된다. 회차는 `endedAt = null`인 한 건뿐이고, 분기를 바꾸면 이전 회차 종료 · 발송 후 결과 대기(`sent`+`pending`)의 `unresolved` 전환 · 새 회차 시작이 한 트랜잭션이다. 새 라우트는 모두 `{data}` / `{data, page}` / `{error:{code,message,details,requestId}}` 봉투(`withListupApiHandler`)와 `Idempotency-Key`(쓰기)를 쓴다.

| 라우트 | 권한 | 내용 |
|---|---|---|
| `GET /acquisition-rounds/current`, `POST /acquisition-rounds` | 조회 / 팀장·관리자 | 현재 회차, 분기 변경(`expectedActiveRoundId`) |
| `GET /contact-history` | 대외협력 | 기업당 한 행: 이전 연락 요약 + 현재 회차 작업. 검색·필터·정렬은 SQL, 커서는 정렬값+companyId |
| `GET /companies/{id}/history` | 대외협력 | drawer: 기업·관계자·저장 조사 요약·전 회차 발송/응답/결과 이력 |
| `POST /companies/{id}/outreaches` | 대외협력 | 현재 회차 작업을 만들거나(201) 기존 것을 그대로 반환(200). 후보·승인 이력을 만들지 않는다 |
| `PATCH /review-outreaches/{id}`, `PUT …/recipient` | 담당자 | 연락 목적, 후보 없이 수신자 선택·직접 입력 |
| `POST …/draft-generation` | 담당자 | 후보 없는 작업은 저장 조사·이전 연락 이력·목적으로 생성(웹 검색 없음), 근거는 `generationHistory`에 스냅샷 |
| `PATCH …/draft` | 담당자 | `contextFingerprint`(목적·수신자·회차·근거의 서버 토큰) 필수 |
| `POST …/send-records` | 담당자 | 발송 기록 + `pending` 결과 + 이력. 응답은 `{sentMessage, outreachVersion, outcomeStatus}` |
| `POST …/outcomes` | 담당자 또는 팀장·관리자 | 수주 완료/거절. 종료 회차·확정 결과의 정정은 `note` 필수 |

정책(합의 전 임시): 종료됐거나 회차가 연결되지 않은 작업은 읽기 전용(`ROUND_CLOSED`), 종료 후 결과 정정 허용. 전이 표는 `src/dh/lib/humanReview/outcome.ts` 한 곳에서 바꾼다. 후보 승인 근거와 재연락 근거의 비교는 `src/dh/lib/humanReview/context.ts`가 맡는다.

## 참고 문서

- [API 계약](../../../docs/admin/api-contract.md)
- [데이터 모델](../../../docs/admin/integration/05_데이터%20모델%20제안.md)
- [정책·확정 규칙](../../../docs/admin/policies.md), [업무 흐름](../../../docs/admin/workflow.md)
- [프론트 연결 지점](../../frontend/docs/dh.md) — `/dh` 목업은 `apps/frontend/src/dh/services/liveRepository.ts`(아직 없음)가 이 API를 호출하도록 `apps/frontend/src/dh/Workspace.tsx`에서 조립해야 한다(`/dh/listup`은 이미 실 API를 쓴다). 프론트의 한국어 Stage enum ↔ 이 API의 영문 코드 변환은 그 어댑터의 책임이며 이 백엔드의 범위는 아니다.
- [portal 도메인](portal.md) — 로그인·가입·회원 관리(admin API).
