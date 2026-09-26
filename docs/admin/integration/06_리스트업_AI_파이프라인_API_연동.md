# 리스트업 AI 파이프라인 API 연동 안내

프론트엔드는 이 문서를 기준으로 Listup 화면을 실제 DH 백엔드 API에 연결한다.

## 코드 위치와 전제

- 브랜치: `refactor/db-schema-split`
- 기준 커밋: [`b0f71c7`](https://github.com/growthhackerssnu/admin/commit/b0f71c7)
- API base URL: 배포된 DH 백엔드의 `/api/v1`
- 이 브랜치는 아직 `main`에 병합되지 않았다.

모든 요청에는 Supabase 세션 토큰을 전달한다.

```http
Authorization: Bearer <session.access_token>
```

`acting`과 `admin`만 사용할 수 있다. 쓰기 요청에는 재시도 중복을 막기 위해 매번 새로운 `Idempotency-Key` 헤더가 필요하다.

```http
Idempotency-Key: <crypto.randomUUID()>
```

응답 필드는 camelCase다.

- 단건 성공: `{ "data": { ... } }`
- 목록 성공: `{ "data": [ ... ], "page": { "nextCursor", "hasMore" } }`
- 실패: `{ "error": { "code", "message", "details?", "requestId" } }`

`REVISION_CONFLICT` 또는 `VERSION_CONFLICT` 응답을 받으면 해당 데이터를 다시 조회한 뒤 사용자가 다시 시도하게 한다.

## 화면별 연동 흐름

### 1. 탐색 시작

먼저 `GET /target-quarters`, `GET /search-options`를 호출한다. 소스 선택 UI는 `search-options.sourceAvailability`를 기준으로 렌더링한다. 현재 `Google`, `뉴스레터`만 사용 가능하며 `혁신의 숲`은 계약 API가 필요한 비활성 소스다.

`POST /search-runs`로 탐색을 시작한다.

```json
{
  "targetQuarterId": "target-quarter-id",
  "maxCompanies": 10,
  "sources": [
    {
      "key": "Google",
      "name": "Google",
      "entryUrls": [],
      "query": "AI 데이터 스타트업"
    },
    {
      "key": "뉴스레터",
      "name": "뉴스레터",
      "entryUrls": [],
      "query": null
    }
  ],
  "filters": {
    "industries": [],
    "keywords": ["AI", "데이터"],
    "regions": [],
    "companyStages": [],
    "excludedCompanyIds": [],
    "additionalConditions": null
  }
}
```

- `maxCompanies`는 `1`~`30`이다.
- Google 소스의 `query`는 비어 있으면 안 된다.
- 성공하면 `202`와 함께 `searchRun`, `initialTask`가 반환된다.

진행 중에는 3~5초 간격으로 아래를 조회한다.

- `GET /search-runs/:searchRunId`: 배치 상태·후보/적합/연락처 집계
- `GET /candidates?searchRunId=:searchRunId`: 후보 목록
- `GET /tasks?searchRunId=:searchRunId`: 작업별 상태와 실패 정보

### 2. 후보 검토

- `GET /candidates/:candidateId`: 기업, 발견·조사 근거, claims, fit 판단, 정보 공백
- `GET /candidates/:candidateId/fit-assessments`: 시스템 판단 이력
- `GET /candidates/:candidateId/contacts`: 연락처 후보와 근거

후보 목록에는 `effectiveFit`, `contacts.usableCount`, 진행 중 작업이 함께 온다. 적합성 판단은 `fit`/`pending`/`unfit`이며, 사람이 내린 판단이 시스템 판단보다 우선한다.

### 3. 컨택 시작과 수신자 선택

`effectiveFit === "fit"`이고 `contacts.usableCount > 0`인 경우에만 **컨택 시작** 버튼을 표시한다.

```http
POST /candidates/:candidateId/outreaches
```

```json
{ "expectedRevision": 3 }
```

성공하면 outreach가 `recipient_selection` 상태로 생성된다.

수신자는 다음 API로 조회하고 선택한다.

```http
GET /outreaches/:outreachId/contacts
PUT /outreaches/:outreachId/recipient
```

```json
{
  "expectedVersion": 1,
  "contactId": "contact-id",
  "endpointId": "email-or-linkedin-endpoint-id"
}
```

### 4. 메시지 초안 생성

수신자가 선택된 뒤 사용자가 **메시지 생성** 버튼을 명시적으로 눌렀을 때만 호출한다.

```http
POST /outreaches/:outreachId/draft-generation
```

```json
{ "expectedVersion": 2 }
```

이 API는 회사 조사·fit 근거·과거 협업 이력·승인 템플릿을 이용해 템플릿의 빈칸만 채운다. 웹 검색과 실제 발송은 수행하지 않는다. 성공하면 outreach 상태가 `draft_review`가 된다.

**후보 조사 완료나 화면 진입만으로 초안을 자동 생성하면 안 된다.**

초안과 컨택 건은 `GET /outreaches/:outreachId`로 다시 조회한다. 이후의 수동 편집·승인·발송 화면은 기존 outreach API 흐름을 그대로 사용한다.

## 배포 전 백엔드 준비 사항

프론트 연동 코드는 먼저 작성할 수 있지만, 운영 환경에서 AI 파이프라인을 실행하려면 백엔드 쪽에서 아래를 별도로 완료해야 한다.

1. DB 마이그레이션 적용
   - `20260926190000_add_past_project_metadata`
   - `20260927110000_add_new_outreach_templates`
2. Supabase, OpenAI, Inngest 환경변수 설정 및 DH 백엔드 배포
3. Inngest에 `/api/inngest` worker 등록

AI 모델 호출은 백엔드 전용이며, 프론트에는 OpenAI 키를 절대 노출하지 않는다.
