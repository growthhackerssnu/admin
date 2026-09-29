# hr 도메인 (그핵드인)

알럼나이 디렉토리 API. 코드는 `src/hr`, 라우트는 `app/api/v1/...`. 화면은 [frontend/docs/hr.md](../../frontend/docs/hr.md). 실행·환경 변수·배포는 [apps/backend/README.md](../README.md).

## 시작하기 전에 — 필독

**[DB 공유 규칙](../../../docs/db/conventions.md)을 먼저 읽어주세요.** 최소한 §2(스키마 구조), §5(`members` 규칙), §7(마이그레이션 위치).

- `hr` 스키마는 hr 소유다(`hr.edit_requests`, `hr.people_cache`).
- `core`(회원·신원)는 portal 소유다. 읽기만 한다 — `role`/`active`를 바꾸지 않는다.
- `dh`(대협봇) 테이블은 코드가 같은 서버에 있어도 접근하지 않는다.

## API

모두 `Authorization: Bearer <Supabase access token>` 필요. 모든 role(admin·acting·alumni)이 통과하고(`src/hr/lib/auth.ts`에 `deny` 없음), admin 전용은 라우트에서 `requireAdmin`으로 막는다.

| API | 설명 |
|---|---|
| `GET /api/v1/people/me` | `{role, notionPageId}` — "내 프로필" 카드, side pane 노출 판단용. portal의 `GET /api/v1/me`(로그인 후 이동 경로)와 용도가 달라 경로를 분리했다 |
| `GET /api/v1/people` | 디렉토리 전체 목록(경량 요약). 검색·필터는 프론트가 메모리에서 한다 |
| `GET /api/v1/people/:notionPageId` | 프로필 상세. 로그인한 누구나 서로의 프로필을 볼 수 있다 |
| `GET /api/v1/field-options` | 수정 폼 드롭다운 값(Notion select 옵션 그대로) |
| `POST /api/v1/edit-requests` | 본인 프로필 수정 요청 제출. 대기 중인 요청이 있으면 덮어쓴다(그래서 멱등성 키 없이도 안전) |
| `GET /api/v1/edit-requests/mine` | 내가 낸 요청 전체(최신순) |
| `GET /api/v1/admin/edit-requests` | (admin) 승인 큐 |
| `POST /api/v1/admin/edit-requests/:id/approve` | (admin) 승인 — **Notion 페이지를 실제로 수정한다**(단방향) |
| `POST /api/v1/admin/edit-requests/:id/reject` | (admin) 반려, 사유 필요 |

## 데이터 흐름

- 원본은 Notion People DB다. `src/hr/lib/peopleCache.ts`가 `hr.people_cache`에 목록을 캐시하고 TTL(5분)이 지나면 Notion에서 다시 채운다. 20기는 임시로 제외(`EXCLUDED_COHORT`).
- 그래서 서버 런타임에 `NOTION_API_KEY`, `NOTION_PEOPLE_DATABASE_ID`가 필요하다.
- 프로필 사진은 일회성 스크립트(`npm run images:migrate -w apps/backend`, `scripts/hr/migrateProfileImages.ts`)로 Supabase Storage에 옮겨 두었다. 이 스크립트만 `SUPABASE_SERVICE_ROLE_KEY`를 쓴다.

## 파일

| 파일 | 내용 |
|---|---|
| `src/hr/lib/auth.ts` | 인증 진입점(`@dhbot/auth`에 Prisma·ApiError 주입), `requireAdmin` |
| `src/hr/lib/apiHandler.ts`, `errors.ts` | requestId·인증·에러 봉투 |
| `src/hr/lib/notion.ts` | Notion 클라이언트·속성 추출·rate limit |
| `src/hr/lib/peopleCache.ts` | 목록 캐시 |
| `src/hr/lib/fieldOptions.ts` | 수정 폼 선택지 |
| `src/hr/lib/editRequests.ts`, `editRequestApproval.ts` | 수정 요청 저장·승인(Notion 반영) |

Prisma Client는 전체 공유(`@/lib/prisma`, `packages/db/schema.prisma`에서 생성). hr 테이블을 추가하려면 `packages/db/schema.prisma`에 `@@schema("hr")` 모델을 추가하고 `packages/db`에서 마이그레이션한 뒤 `npm run db:generate -w apps/backend`.

## 아직 정해지지 않은 것

- **alumni 쓰기 범위** — 지금은 본인 프로필 수정 요청까지 허용한다. 더 넓은 쓰기 API가 생기면 `deny`로 막을지 라우트별로 나눌지 정한다.
- **멱등성** — 새 쓰기 API에 필요해지면 `src/portal/lib/idempotency.ts` 패턴을 쓰고 테이블은 `hr.idempotency_keys`를 새로 만든다([conventions §4.1](../../../docs/db/conventions.md)).
