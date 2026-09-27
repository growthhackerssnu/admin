# dh-backend API 연결 명세

`apps/dh-backend`가 내려주는 응답의 공통 규약이다. **저장소에서 이 문서가 API 표기의 유일한 기준이다.**

> **기준 문서: v0.4** (`리스트업_통합_데이터스키마_API명세_v0.4.md`). 표기는 **camelCase**이고, **봉투는 기능마다 두 벌**이다.
>
> v0.4 §8.3이 "v0.1 응답 봉투와 기존 대협봇 응답 봉투를 표기법 변경에 편승해 통합하지 않는다"고 명시했다. 한때 하나로 합쳤다가 되돌렸으니 **다시 합치지 말 것.**
>
> 같은 날 **차수(cycle) 개념을 없애고 분기(quarter)로 바꿨다.** 자세한 내용은 §5.

## 1. 공통 규약

- JSON 키는 **camelCase**. 요청 본문·응답 본문·쿼리 파라미터 모두 해당한다.
- **enum 값은 snake_case다.** 바뀌는 건 키뿐이다: `{ "effectiveFit": "not_assessed" }`, `{ "type": "company_discovery" }`, `{ "basis": "reported_fact" }`. 예외로 `allowedActions`의 값은 camelCase다(`approveCompany`, `skipForQuarter` …).
- DB 컬럼은 계속 snake_case이고, 변환은 Prisma와 serializer가 맡는다(`docs/db/conventions.md` §8).
- 모든 ID는 CUID 형식의 불투명 문자열이다. UUID 형식을 가정하지 않는다.
- 시각은 UTC ISO 8601 문자열. null은 생략하지 않고 명시적으로 내려준다.
- 인증은 `Authorization: Bearer <supabase access token>`. `alumni` 역할은 dh 접근이 막혀 있다.
- 이력·작업을 만드는 모든 POST에 `Idempotency-Key` 헤더가 필요하다.
- 동시 수정이 있는 리소스는 기대 버전을 같이 보낸다(`expectedVersion` 또는 `expectedRevision`).

### 성공 응답 — 봉투가 둘이다

기능마다 포장이 다르다(v0.4 §6.1). 표기법 예외가 아니라 **호환 경계**이고, 프론트 API 계층에서 정규화한다.

```jsonc
// 리스트업(신규): /search-runs, /candidates, /tasks, /target-quarters, /company-research, /evidence
{ "data": { "id": "clx...", "effectiveFit": "not_assessed" } }
{ "data": [ ... ], "page": { "nextCursor": "Y2x4...", "hasMore": true } }

// 발송(기존): /companies, /outreaches, /drafts, /sends, /members, /template-bindings, /search-options
{ "data": { ... }, "requestId": "dc5f19a1-..." }
{ "data": { "items": [ ... ], "nextCursor": null }, "requestId": "dc5f19a1-..." }
```

리스트업 봉투는 성공에 `requestId`가 없다(오류 안에만 있다). 목록은 `limit` 기본 20·최대 100이고 `cursor`는 서버가 발급하는 불투명 문자열이다.

### 오류 응답 — 역시 둘이다

```jsonc
// 리스트업: details, requestId가 error 안
{ "error": { "code": "FIT_REQUIRED", "message": "...",
             "details": { "effectiveFit": "pending" }, "requestId": "..." } }

// 발송: fieldErrors·retryable, requestId가 바깥
{ "error": { "code": "VALIDATION_ERROR", "message": "...",
             "fieldErrors": { "limit": "1 이상의 정수" }, "retryable": false },
  "requestId": "..." }
```

구현은 `src/lib/errors.ts`(발송)와 `src/lib/listup/errors.ts`(리스트업)로 나뉘어 있고, 래퍼도 `withApiHandler` / `withListupApiHandler`로 갈린다. 오류 "값"(코드 테이블)은 한 벌을 공유한다.

## 2. 오류 코드

| 코드 | HTTP | 의미 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 토큰이 없거나 유효하지 않음 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 또는 접근 불가 |
| `REVISION_CONFLICT` | 409 | **조사 기록**(`expectedRevision`) 불일치 |
| `VERSION_CONFLICT` | 409 | **컨택 건·기업**(`expectedVersion`) 불일치 |
| `IDEMPOTENCY_CONFLICT` | 409 | 같은 키에 다른 경로·다른 본문 |
| `INVALID_STATE` | 409 | 지금 상태에서 허용되지 않는 동작 |
| `ALREADY_EXISTS` | 409 | 유일해야 하는 값의 중복(분기 라벨 등) |
| `FIT_REQUIRED` | 409 | 적합 후보만 가능한 요청 |
| `NO_CONTACT_TO_VERIFY` | 409 | 검증할 연락 창구가 없음 |
| `TASK_ALREADY_RUNNING` | 409 | 같은 종류의 조사가 다른 내용으로 진행 중 |
| `TASK_NOT_RETRYABLE` | 409 | 재시도할 수 없는 작업 |
| `SAME_QUARTER_BLOCKED` | 409 | 같은 분기에 이미 발송함 |
| `CONTACT_EXCLUDED` | 409 | 제외 대상 관계자 |
| `TEMPLATE_NOT_CONNECTED` | 409 | 경로별 지정 템플릿 미연결 |
| `VALIDATION_ERROR` | 422 | 필드·쿼리·커서 제약 위반 |
| `UNSUPPORTED_SOURCE` | 422 | 지원하지 않는 탐색 소스 |
| `RATE_LIMITED` | 429 | 요청 한도 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |
| `SERVICE_UNAVAILABLE` | 503 | 일시적으로 접수 불가 |

**400대 코드는 없다.** 잘못된 필드·쿼리 값·커서는 전부 422 `VALIDATION_ERROR`다(v0.3 §7.1).

발송 단계 코드(`PREVIEW_STALE`, `ALREADY_SENT`)는 해당 기능을 구현할 때 함께 추가한다.

## 3. 엔드포인트

전부 `/api/v1` 아래에 있다.

### 리스트업 — 기업 발견·판단·연락처

`리스트업_데이터스키마_API명세_v0.1.md`를 구현했고, 표기는 v0.3 §7.1을 따른다. 명세와 다른 점:

- **`workspaceId`는 없다.** GH SNU 단일 조직이라 다중 테넌시 칸막이를 도입하지 않았다.
- **`quarterId`가 추가됐다.** 탐색은 분기에 속한다(§5).

| Method | Path | 성공 |
|---|---|---|
| POST | `/search-runs` | 202 + `Location` |
| GET | `/search-runs` · `/search-runs/{id}` | 200 |
| POST | `/search-runs/{id}/cancel` | 202 |
| GET | `/candidates` · `/candidates/{id}` | 200 |
| GET | `/candidates/{id}/fit-assessments` · `/human-fit-decisions` · `/contacts` | 200 |
| POST | `/candidates/{id}/human-fit-decisions` | 201 |
| POST | `/candidates/{id}/research-requests` | 202 + `Location` |
| GET | `/companies/{id}` · `/company-research/{id}` · `/evidence/{id}` | 200 |
| GET | `/tasks` · `/tasks/{id}` | 200 |
| POST | `/tasks/{id}/retry` | 202 |

명세에 없는 값이 몇 개 더 실린다: 탐색의 `duplicateExcludedCount`(화면의 "중복 N개 제외"), `createdBy.displayName`(배치 담당자 이름), 분기 정보 `quarter: { id, label }`.

**아직 워커가 없다.** 작업(`research_tasks`) 레코드는 만들어지지만 실제로 기업을 찾아오는 파이프라인은 다음 단계다.

#### DB에 저장되는 JSON도 camelCase다

탐색 조건(`searchRuns.sources` / `filters` / `limits`), `fitAssessments.informationGaps`, `researchTasks.resultRefs`는 **요청 본문을 받은 그대로 보관하고 그대로 내보낸다.** 중첩 객체를 오가며 변환하지 않기 위한 선택이다.

```jsonc
{ "sources": [{ "key": "Google", "name": "Google", "entryUrls": [], "query": "구독 서비스" }],
  "filters": { "industries": [], "keywords": [], "regions": [], "companyStages": [],
               "excludedCompanyIds": [], "additionalConditions": null },
  "limits": { "maxCompanies": 20, "maxFitFollowupRounds": 1, "maxContactSearchRounds": 2 } }
```

> v0.3 §1은 이 스냅샷의 키를 snake_case로 적어뒀지만, v0.1 본문을 옮겨온 것으로 보여 따르지 않았다.

### 분기

| Method | Path | 비고 |
|---|---|---|
| GET | `/quarters?active` | 목록 |
| POST | `/quarters` | 새 분기를 연다. 라벨은 `YYYY-Qn` 형식. 중복이면 `ALREADY_EXISTS` |
| PATCH | `/quarters/{id}` | `{ "active": false }`로 닫고, `true`로 다시 연다 |

### 발송(컨택) — 기존 기능

`/companies`(작업 목록), `/companies/{id}/history`, `/companies/{id}/exclusion`, `/outreaches/{id}`(+ `approval` · `skip` · `recipient` · `recipient-review` · `draft-review` · `response-checks` · `contacts`), `/drafts/{outreachId}`(+ `approval`), `/sends/{sendId}`, `/members`, `/template-bindings`, `/search-options`.

> `/companies/{id}`는 **기업 식별 정보**(이름·별칭·도메인)를 돌려준다. 발송용 필드(`product`, 제외 플래그, 과거 협업 등)는 `/outreaches/{id}` 응답의 `company` 하위 객체에 있다.

## 4. 권한 (P-23)

**조회는 누구에게나 열려 있고, 변경만 담당자로 제한한다.**

- 팀원은 본인 담당 업무만 변경한다. 타인 업무는 조회만 가능하다.
- 팀장은 전체를 변경한다. 지금 저장소의 역할 중 `admin`이 팀장이다.
- 담당자 판정: 컨택 건이 있으면 `Outreach.ownerId`, 아직 조사 단계면 원발견 배치의 `SearchRun.assignedMemberId`. 탐색을 시작한 사람이 첫 전송까지 담당하며(P-02) 보완 조사·분기 이동으로 바뀌지 않는다.
- 담당자를 모르는 과거 행은 소유권을 추정하지 않고 팀장만 변경한다.
- 권한 없는 단건 변경은 **403 `FORBIDDEN`**.
- 역할·사용자 ID는 서버가 인증 정보에서만 읽는다. 요청 본문에 `role`이나 `ownerId`를 넣어도 권한을 얻거나 담당자를 덮어쓸 수 없다.
- 응답의 `allowedActions`는 UI 안내일 뿐이고 권한 검사의 대체물이 아니다. 변경 요청마다 서버가 다시 확인한다.

새로 만드는 두 동작에는 담당자 검사가 없다 — 대조할 담당자가 아직 없기 때문이다. `POST /search-runs`(시작한 사람이 담당자가 된다)와 `POST /target-quarters`(팀 공용 라벨)가 그렇다.

구현은 `src/lib/permissions.ts`다. `src/lib/auth.ts`의 capability 표는 **역할** 축이라 이 규칙과 별개이며 여전히 미사용이다.

## 5. 동시 수정

- 컨택 건·기업은 `version` 컬럼을 쓰고 요청에 `expectedVersion`을 보낸다.
- 리스트업 후보는 `revision` 컬럼을 쓰고 `expectedRevision`을 보낸다. 후보의 `revision`은 사용자에게 보이는 상태(판단·연락 상태·창구 수)가 바뀔 때 올라간다.
- 어긋나면 둘 다 `VERSION_CONFLICT`다. 클라이언트는 최신 상세를 다시 읽고, 사람의 변경을 임의로 덮어쓰지 않는다.

## 6. 차수 → 분기

- `cycles` → `quarters`. 라벨(`2026-Q4`)은 **담당자가 직접 정한다** — 달력에서 계산하지 않는다.
- **전역 "현재 분기"는 없다.** 각 컨택 건·탐색이 자기 분기를 들고 있다. 예전 요청 필드 `expectedActiveCycleId`와 오류 코드 `ACTIVE_CYCLE_CHANGED`는 사라졌다.
- "같은 분기에 재발송 금지" 규칙은 그대로이고 코드만 `SAME_QUARTER_BLOCKED`로 바뀌었다.
- `/cycles` 경로는 `/quarters`로 대체됐다.

> v0.3은 기존 `Cycle`을 남기고 `targetQuarters`(연도·분기 정수, 달력 분기 실적과 별도 축)를 새로 추가하라고 한다. 우리 구현과 다르며 **아직 합의되지 않았다**(§6).

## 7. 아직 합의가 필요한 것

- **목표 분기 모델.** v0.3의 `target_quarters`(year/quarter 정수) vs 현재의 `quarters`(라벨 문자열). 발송 실적을 `sentAt`의 달력 분기로 세는 축도 아직 없다.
- **연락처 테이블.** v0.3은 기존 `contacts`/`contactEndpoints` 확장을 요구하지만, 현재는 별도 테이블(`companyPersons`/`contactChannels`/`candidateContacts`)로 구현돼 있다.
- **`Candidate` → `InvestigationResult`** 이름 변경과 `companyId` 전역 유일 제약, `/candidates`를 `/search-runs/{id}/results`와 `/outreach-candidates`로 분할하는 건.
- **인계(handoff).** 프론트의 "컨택 작업으로 넘기기"에 해당하는 엔드포인트가 없다. 승격 로직(`src/lib/listup/promotion.ts`)은 있지만 호출 경로는 비어 있다.
- **탐색 생성의 `filters`·`limits`.** 명세대로 전부 필수로 받고 있는데 프론트 탐색 폼에는 입력란이 없다. 서버 기본값을 둘지 정해야 한다.
- **탐색 소스.** 지금 허용하는 key는 `Google` / `뉴스레터` / `혁신의 숲` 셋이다. 각 소스의 실제 수집 방식은 워커 단계에서 정한다.
