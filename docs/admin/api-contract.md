# dh-backend API 연결 명세

`apps/dh-backend`가 내려주는 응답의 공통 규약이다. **저장소에서 이 문서가 API 표기의 유일한 기준이다.**

> **바뀐 점 (2026-09-26).** 예전 규약(camelCase 필드, `{ data, requestId }` 봉투, `VERSION_CONFLICT`)은 폐기했다. 프론트가 넘긴 `리스트업_데이터스키마_API명세_v0.1.md`의 표기를 백엔드 전체에 적용했고, 기존 발송(컨택) 엔드포인트도 전부 같은 규약으로 옮겼다. 아직 실제 API를 호출하는 프론트 코드가 없어서 깨지는 화면은 없지만, 연동 시 필드 이름을 새로 맞춰야 한다.
>
> 같은 날 **차수(cycle) 개념을 없애고 분기(quarter)로 바꿨다.** 자세한 내용은 아래 §5.

## 1. 공통 규약

- JSON 키는 **snake_case**. 요청 본문·응답 본문·쿼리 파라미터 모두 해당한다.
- 인증은 `Authorization: Bearer <supabase access token>`. 모든 업무 요청은 인증된 회원 범위에서 동작하며, `alumni` 역할은 dh 접근이 막혀 있다.
- 이력이나 작업을 만드는 모든 POST에 `Idempotency-Key` 헤더가 필요하다. 없으면 400이다.
- 동시 수정이 있는 리소스는 요청에 기대 버전을 같이 보낸다(`expected_version` 또는 `expected_revision`). 어긋나면 409다.

### 성공 응답

```jsonc
// 단건
{ "data": { "id": "clx...", "legal_name": null } }

// 목록
{ "data": [ { "id": "clx..." } ],
  "page": { "next_cursor": "Y2x4...", "has_more": true } }
```

성공 응답에는 top-level `request_id`가 없다. 목록은 `limit` 기본 20 · 최대 100이고, `cursor`는 서버가 발급하는 불투명 문자열이라 클라이언트가 해석하지 않는다.

### 오류 응답

```jsonc
{ "error": {
    "code": "REVISION_CONFLICT",
    "message": "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.",
    "details": { "expected_revision": 3, "current_revision": 4 },
    "request_id": "dc5f19a1-..." } }
```

`details`는 코드마다 다르고 없을 수도 있다. `request_id`는 오류 봉투 안에만 있다.

## 2. 오류 코드

| 코드 | HTTP | 의미 |
|---|---|---|
| `INVALID_REQUEST` | 400 | 잘못된 JSON·쿼리 값·필수 헤더 누락 |
| `UNAUTHENTICATED` | 401 | 토큰이 없거나 유효하지 않음 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `REVISION_CONFLICT` | 409 | 기대 버전 불일치 (`details`에 기대/현재 값) |
| `IDEMPOTENCY_CONFLICT` | 409 | 같은 키에 다른 경로·다른 본문 |
| `INVALID_STATE` | 409 | 지금 상태에서 허용되지 않는 동작 |
| `FIT_REQUIRED` | 409 | 적합 후보만 가능한 요청 |
| `NO_CONTACT_TO_VERIFY` | 409 | 검증할 연락 창구가 없음 |
| `TASK_ALREADY_RUNNING` | 409 | 같은 종류의 조사가 다른 내용으로 진행 중 |
| `TASK_NOT_RETRYABLE` | 409 | 재시도할 수 없는 작업 |
| `SAME_QUARTER_BLOCKED` | 409 | 같은 분기에 이미 발송함 |
| `CONTACT_EXCLUDED` | 409 | 제외 대상 관계자 |
| `TEMPLATE_NOT_CONNECTED` | 409 | 경로별 지정 템플릿 미연결 |
| `VALIDATION_ERROR` | 422 | 스키마는 맞으나 값 제약 위반 |
| `UNSUPPORTED_SOURCE` | 422 | 지원하지 않는 탐색 소스 |
| `RATE_LIMITED` | 429 | 요청 한도 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |
| `SERVICE_UNAVAILABLE` | 503 | 일시적으로 접수 불가 |

400과 422의 경계: **형식이 틀리면 400, 형식은 맞고 값이 제약을 어기면 422.**

## 3. 엔드포인트

전부 `/api/v1` 아래에 있다.

### 리스트업 — 기업 발견·판단·연락처

명세 `리스트업_데이터스키마_API명세_v0.1.md`를 그대로 구현했다. 아래 두 가지만 다르다.

- **`workspace_id`는 없다.** GH SNU 단일 조직이라 다중 테넌시 칸막이를 도입하지 않았다.
- **`quarter_id`가 추가됐다.** 탐색은 수주 분기에 속한다(§5).

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

`/search-runs/{id}`와 `/candidates` 응답에는 명세에 없는 값이 몇 개 더 실린다: 탐색의 `duplicate_excluded_count`(화면의 "중복 N개 제외"), `created_by.display_name`(배치 담당자 이름), 분기 정보 `quarter: { id, label }`.

**아직 워커가 없다.** 작업(`research_tasks`) 레코드는 만들어지지만 실제로 기업을 찾아오는 파이프라인은 다음 단계다. 그래서 지금은 `contact_status`가 `searching`으로 바뀌어도 그 상태로 머문다.

### 분기

| Method | Path | 비고 |
|---|---|---|
| GET | `/quarters?active` | 목록 |
| POST | `/quarters` | 새 분기를 연다. 라벨은 `YYYY-Qn` 형식 |
| PATCH | `/quarters/{id}` | `{ "active": false }`로 닫고, `true`로 다시 연다 |

### 발송(컨택) — 기존 기능

`/companies`(작업 목록), `/companies/{id}/history`, `/companies/{id}/exclusion`, `/outreaches/{id}`(+ `approval` · `skip` · `recipient` · `recipient-review` · `draft-review` · `response-checks` · `contacts`), `/drafts/{outreachId}`(+ `approval`), `/sends/{sendId}`, `/members`, `/template-bindings`, `/search-options`.

동작은 그대로이고 표기만 새 규약으로 바뀌었다. 상세 응답의 `allowed_actions` 값도 snake_case다(`approve_company`, `skip_for_quarter`, `generate_draft` …).

> `/companies/{id}`는 이제 **명세의 기업 식별 정보**(이름·별칭·도메인)를 돌려준다. 예전에 여기 같이 실리던 발송용 필드(`product`, 제외 플래그, 과거 협업 등)는 `/outreaches/{id}` 응답의 `company` 하위 객체로 옮겼다.

## 4. 동시 수정

- 컨택 건·기업은 `version` 컬럼을 쓰고 요청에 `expected_version`을 보낸다.
- 리스트업 후보는 `revision` 컬럼을 쓰고 `expected_revision`을 보낸다. 후보의 `revision`은 사용자에게 보이는 상태(판단·연락 상태·창구 수)가 바뀔 때 올라간다.
- 어긋나면 둘 다 `REVISION_CONFLICT`다.

## 5. 차수 → 분기

예전에는 `cycles` 테이블과 "현재 활성 차수" 전역 상태가 있었다. 프론트가 모든 화면을 **수주 분기**로 묶으면서 다음과 같이 바꿨다.

- `cycles` → `quarters`. 라벨(`2026-Q4`)은 **담당자가 직접 정한다** — 달력에서 자동으로 계산하지 않는다.
- **전역 "현재 분기"는 없다.** 각 컨택 건·탐색이 자기 분기를 들고 있다. 그래서 예전 요청 필드 `expectedActiveCycleId`와 오류 코드 `ACTIVE_CYCLE_CHANGED`는 사라졌다.
- "같은 분기에 재발송 금지" 규칙은 그대로이고 코드만 `SAME_QUARTER_BLOCKED`로 바뀌었다.
- `/cycles` 경로는 `/quarters`로 대체됐다.

## 6. 아직 합의가 필요한 것

- **인계(handoff).** 프론트의 "컨택 작업으로 넘기기"(적합 + 연락 가능)에 해당하는 엔드포인트가 명세에 없다. 승격 로직(`src/lib/listup/promotion.ts`)은 만들어뒀지만 호출하는 경로는 아직 없다.
- **탐색 생성 요청의 `filters`·`limits`.** 명세대로 전부 필수로 받고 있는데, 프론트 탐색 폼에는 입력란이 없다(조건 문자열 + 소스 체크박스만). 연동 시점에 기본값을 서버가 채울지 정해야 한다.
- **id 형식.** 명세는 UUID라고 적혀 있지만 이 저장소의 기본키는 `cuid()` 문자열이다. 불투명 문자열로 다루면 된다.
- **탐색 소스.** 지금 허용하는 key는 프론트 폼과 같은 `Google` / `뉴스레터` / `혁신의 숲` 셋이다. 각 소스를 실제로 어떻게 수집할지는 워커 단계에서 정한다.
