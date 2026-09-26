# dh-backend API 연결 명세

`apps/dh-backend`가 내려주는 응답의 공통 규약이다. **저장소에서 이 문서가 API 표기의 유일한 기준이다.**

> **표기 확정 (2026-09-26).** 리스트업–컨택 통합 명세 **v0.3 §7.1**을 따른다: HTTP DTO는 **camelCase**, 봉투는 `{ data, requestId }`.
>
> 짧은 기간 snake_case + `{ data }` 봉투로 구현했던 적이 있다(v0.1 명세 기준). v0.3이 camelCase를 요구하고 프론트 자체 모델도 camelCase라서 되돌렸다. **더 이상 뒤집지 않는다** — 표기를 바꾸려면 이 문서를 먼저 고치고 합의한다.
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

### 성공 응답

```jsonc
// 단건
{ "data": { "id": "clx...", "legalName": null, "canonicalDomain": "example.com" },
  "requestId": "dc5f19a1-..." }

// 목록
{ "data": { "items": [ { "id": "clx...", "effectiveFit": "fit" } ], "nextCursor": "Y2x4..." },
  "requestId": "dc5f19a1-..." }
```

`nextCursor`가 null이면 다음 페이지가 없다. 별도의 `hasMore`는 두지 않는다. 목록은 `limit` 기본 20 · 최대 100이고, `cursor`는 서버가 발급하는 불투명 문자열이라 클라이언트가 해석하지 않는다. 필터를 바꾸면 이전 커서를 재사용하지 않는다.

### 오류 응답

```jsonc
{ "error": {
    "code": "VALIDATION_ERROR",
    "message": "effectiveFit 값이 올바르지 않습니다.",
    "fieldErrors": { "effectiveFit": "허용되지 않는 값" },
    "retryable": false },
  "requestId": "dc5f19a1-..." }
```

`fieldErrors`는 필드당 한 줄이고 없을 수도 있다. `retryable`은 클라이언트가 같은 요청을 그대로 다시 보내도 되는지를 뜻하며, 한도·일시 장애에만 true다.

## 2. 오류 코드

| 코드 | HTTP | 의미 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 토큰이 없거나 유효하지 않음 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 또는 접근 불가 |
| `VERSION_CONFLICT` | 409 | 기대 버전 불일치. 최신 상세를 다시 읽는다 |
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

## 4. 동시 수정

- 컨택 건·기업은 `version` 컬럼을 쓰고 요청에 `expectedVersion`을 보낸다.
- 리스트업 후보는 `revision` 컬럼을 쓰고 `expectedRevision`을 보낸다. 후보의 `revision`은 사용자에게 보이는 상태(판단·연락 상태·창구 수)가 바뀔 때 올라간다.
- 어긋나면 둘 다 `VERSION_CONFLICT`다. 클라이언트는 최신 상세를 다시 읽고, 사람의 변경을 임의로 덮어쓰지 않는다.

## 5. 차수 → 분기

- `cycles` → `quarters`. 라벨(`2026-Q4`)은 **담당자가 직접 정한다** — 달력에서 계산하지 않는다.
- **전역 "현재 분기"는 없다.** 각 컨택 건·탐색이 자기 분기를 들고 있다. 예전 요청 필드 `expectedActiveCycleId`와 오류 코드 `ACTIVE_CYCLE_CHANGED`는 사라졌다.
- "같은 분기에 재발송 금지" 규칙은 그대로이고 코드만 `SAME_QUARTER_BLOCKED`로 바뀌었다.
- `/cycles` 경로는 `/quarters`로 대체됐다.

> v0.3은 기존 `Cycle`을 남기고 `targetQuarters`(연도·분기 정수, 달력 분기 실적과 별도 축)를 새로 추가하라고 한다. 우리 구현과 다르며 **아직 합의되지 않았다**(§6).

## 6. 아직 합의가 필요한 것

- **목표 분기 모델.** v0.3의 `target_quarters`(year/quarter 정수) vs 현재의 `quarters`(라벨 문자열). 발송 실적을 `sentAt`의 달력 분기로 세는 축도 아직 없다.
- **연락처 테이블.** v0.3은 기존 `contacts`/`contactEndpoints` 확장을 요구하지만, 현재는 별도 테이블(`companyPersons`/`contactChannels`/`candidateContacts`)로 구현돼 있다.
- **`Candidate` → `InvestigationResult`** 이름 변경과 `companyId` 전역 유일 제약, `/candidates`를 `/search-runs/{id}/results`와 `/outreach-candidates`로 분할하는 건.
- **인계(handoff).** 프론트의 "컨택 작업으로 넘기기"에 해당하는 엔드포인트가 없다. 승격 로직(`src/lib/listup/promotion.ts`)은 있지만 호출 경로는 비어 있다.
- **탐색 생성의 `filters`·`limits`.** 명세대로 전부 필수로 받고 있는데 프론트 탐색 폼에는 입력란이 없다. 서버 기본값을 둘지 정해야 한다.
- **탐색 소스.** 지금 허용하는 key는 `Google` / `뉴스레터` / `혁신의 숲` 셋이다. 각 소스의 실제 수집 방식은 워커 단계에서 정한다.
