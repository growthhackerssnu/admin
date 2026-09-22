# 대협 어드민 API 연결 명세 초안

기준: 2026-09-22, PR #5 프론트 기반의 `OutreachRepository`와 `CompanyCommand`.
목적: 프론트·백엔드 담당자가 필요한 기능, 요청·응답, 상태 전환과 구현 순서를 합의한다.

**아래 HTTP 주소와 영문 코드는 제안이며 구현된 API가 아니다.** 현재 프론트는 샘플 adapter만 사용한다. HTTP 대신 서버 함수/RPC를 사용해도 동일한 업무 계약을 적용할 수 있다. DB 테이블 구조를 강제하지 않는다.

## 1. 현재 코드에 실제로 있는 연결 지점

| 인터페이스 | 현재 동작 | 운영 연결 방향 |
|---|---|---|
| `load()` | 전체 차수·기업 Workspace 조회 | 사용자·차수·목록·상세 조회로 분리 |
| `getTemplates()` | 경로별 null 또는 템플릿 객체 | 경로별 템플릿 연결 상태 조회 |
| `execute(companyId, expectedVersion, command)` | 11종 업무 명령, 전체 Workspace 반환 | 컨택 건을 식별하는 업무 API 호출 후 관련 화면 갱신 |
| `search(input, expectedCycleId)` | 차수 시작/추가 탐색과 샘플 1건 생성 | 차수 확정과 비동기 탐색 작업 접수 |
| `reset()` | 개발용 브라우저 데이터 초기화 | **운영 API로 만들지 않음** |

`execute` 명령 11종: approveCompany, skipForCycle, excludeCompany, searchContacts, selectRecipient, changeRecipient, generateDraft, saveDraft, approveDraft, recordSimulatedSend, saveResponse.

현재 UI는 변경 성공 시 전체 Workspace를 교체한다. 아래 API는 변경된 상세만 반환하므로 실제 adapter/hook에서 목록·상세·차수 캐시 갱신을 구현해야 한다. 단순 URL 치환만으로 연결이 끝나는 것은 아니다.

## 2. 구분해서 식별할 객체

| 식별자 | 의미 |
|---|---|
| companyId | 차수와 관계없이 유지되는 기업 |
| cycleId | PM이 시작하는 수주 차수. 탐색 실행 1회와 다름 |
| outreachId | 특정 차수의 기업 컨택 작업. 이전 차수 초안과 결과를 덮어쓰지 않음 |
| contactId | 사람. 다른 이메일·채널이어도 동일인이면 같은 ID |
| endpointId | 실제 수신 주소/프로필과 채널 |
| draftId + revision | 초안과 수정 버전 |
| sendId | 개별 발송 기록/발송 요청 |
| responseId | 사람이 기록한 응답 확인 결과 |
| jobId | 기업 탐색·관계자 조사·초안 생성 작업 |

현재 프론트 Company는 이 정보를 하나로 합친 화면용 객체다. 실제 연결 시 outreachId, draftId, endpointId, activeCycleId를 추가한다. cycles 배열의 마지막 항목을 활성 차수로 추정하지 않는다. 동일 기업·차수의 복수 컨택 건 허용 여부는 합의 필요하다.

## 3. 공통 규격 제안

- 기본 경로: `/api/v1`. 모든 업무 요청은 인증된 학회 멤버 범위에서 처리한다.
- 사용자·소속·실행자·권한은 인증 정보로 결정한다. body의 `by`, 사용자 이름, PM 여부를 신뢰하지 않는다.
- 권한 이름은 `view`, `review`, `start_cycle`, `manage_settings`, `send` 등을 제안한다. 실제 역할별 권한 표는 합의한다.
- 성공: `{ "data": ..., "requestId": "..." }`. 목록 data: `{ "items": [...], "nextCursor": null }`.
- 실패: `{ "error": { "code": "...", "message": "...", "fieldErrors": {}, "retryable": false }, "requestId": "..." }`.
- 정상 조회/변경 200, 생성 완료 201, 장시간 작업 접수 202. 접수는 조사·생성·발송 완료가 아니다.
- 변경 요청은 `expectedVersion`을 보낸다. 초안 관련 요청은 `expectedRevision`도 보낸다. 기업 자체 변경은 `expectedCompanyVersion`을 별도로 사용한다.
- 모든 POST/PUT/PATCH 업무 변경에는 `Idempotency-Key`를 사용한다. 같은 행동의 통신 재시도는 같은 키, 새로운 행동은 새 키. 서버는 사용자/소속·행동·payload와 키를 묶어 처리한다. 같은 키에 다른 payload는 409.
- 중복 키 조회는 새 version 검사보다 먼저 처리해 이미 성공한 응답을 재반환한다. 키 보존 기간과 만료 후 조회 방법은 구현 전에 합의한다.
- 서버는 version 비교·상태 변경·이력 기록을 원자적으로 처리한다. 프론트의 disabled 버튼은 중복/권한 방어 수단이 아니다.
- 시각은 ISO 8601 UTC, 화면은 한국 시간. 실행 시각은 서버 기록. 사람이 입력한 외부 발송 시각·응답 수신 시각은 별도 필드로 구분한다.
- 값 없음은 null, 미확인 상태는 별도 코드. 목록 limit 기본 20/최대 100 제안, cursor는 불투명 문자열. 지원 정렬은 명시적 허용 목록으로 제한한다.
- 현재 차수에 속한 행동(검토·관계자 선택·생성·승인·발송·건너뛰기)은 expectedActiveCycleId도 보내고 서버가 활성 차수와 대조한다. 차수가 바뀌었다고 요청을 조용히 새 차수에 적용하지 않는다. 아래 표는 반복되는 공통 필드를 일부 생략한다. 과거 발송의 응답 기록은 명시된 outreachId/sendId에 연결하며 활성 차수와 별개로 검증한다.
- 최신 작업 가능 여부는 `allowedActions`, 불가 사유는 `blockedReasons`로 내려준다. 숨김 처리만으로 끝내지 않고 서버도 재검증한다.

## 4. 현재 화면을 연결하는 조회 API

아래 01~11은 현재 화면 데이터에 필요한 논리적 조회다. 요청 수를 줄이기 위해 상세 응답에 후보·초안·최근 이력을 포함해도 된다.

| 번호 | API 제안 | 입력 | 핵심 반환 | 화면/용도 |
|---|---|---|---|---|
| 01 | `GET /me` | 인증 세션 | userId, displayName, organizationId, capabilities | 고정 샘플 사용자 교체 |
| 02 | `GET /cycles` | cursor, limit | id, name, startedAt, endedAt, startedBy, activeCycleId | 현재 차수 및 이전 차수 |
| 03 | `GET /search-options` | 없음 | domain/productType/companySize/channel/source 선택지와 제외 조건, version | 탐색 폼의 고정 옵션 교체 |
| 04 | `GET /companies` | cycleId, lane, route, stage, ownerId, query, sort, cursor, limit | 기업 요약, outreachId, 상태·다음 행동, 최근 발송, 담당자, pagination | 목록·필터·패널 진입 |
| 05 | `GET /companies/{companyId}` | 선택적 cycleId | 기업 자료·근거·companyVersion, 이번/과거 outreach 참조, 협업 자료 링크 | 요약 패널·기업 자료 |
| 06 | `GET /outreaches/{outreachId}` | 없음 | 컨택 건 상세, version, 수신자, 초안, 응답, 이전 맥락, allowedActions | 이번 컨택 |
| 07 | `GET /outreaches/{outreachId}/contacts` | 선택적 cursor, limit | 후보·기존 담당자, endpoint, 선택 가능 여부와 제외 사유, 조사 시각 | 관계자 선택 |
| 08 | `GET /companies/{companyId}/history` | 선택적 cycleId, cursor, limit | 구조화된 이벤트, 실행자, 시각, send/response/draft 참조 | 발송·컨택 이력 |
| 09 | `GET /sends/{sendId}` | 없음 | 상태와 발송 당시 수신자·주소·제목·본문·주제·템플릿 스냅샷 | 발송 내용 보기 |
| 10 | `GET /template-bindings` | 선택적 route | 연결 여부, templateId/version, requiredVariables | 생성 가능 여부·운영 안내 |
| 11 | `GET /members` | 활성 멤버 여부 | id, displayName | 담당자 필터 |

`lane` 제안: all/list/message/status. `route` 제안: new/alternate_contact/recontact/repeat_collaboration. 목록의 전체 탭 범위와 각 탭 포함 상태는 서버·프론트가 동일하게 합의한다. 논의 중 기업은 리스트업에 포함하지 않되 직접 상세/이력 접근은 권한 범위에서 유지한다.

템플릿 본문은 서버 생성에만 필요하다면 브라우저로 보내지 않아도 된다. 현재 TemplateBindings 타입은 subject/body를 요구하므로 metadata 타입으로 바꾸는 작업이 필요하다. 미연결은 정상 응답의 `connected:false`로 표현한다.

### 상세 응답의 최소 구조

```json
{
  "data": {
    "id": "outreach-001",
    "companyId": "company-001",
    "cycleId": "cycle-001",
    "version": 4,
    "route": "recontact",
    "workStage": "company_review",
    "responseStatus": "deferred",
    "internalDecision": "active",
    "recipient": null,
    "draft": null,
    "latestResponse": {
      "id": "response-001",
      "result": "deferred",
      "category": "resource_shortage",
      "note": "현재 담당 팀 리소스 부족",
      "revisitCondition": "다음 차수에 일정 확인",
      "checkedAt": "2026-09-22T03:00:00Z",
      "checkedBy": { "id": "member-001", "displayName": "담당자" }
    },
    "allowedActions": ["approveCompany", "skipForCycle", "excludeCompany"],
    "blockedReasons": []
  },
  "requestId": "req-001"
}
```

값은 구조 설명용이며 특정 상태 조합의 최종 업무 정책을 확정하지 않는다. 상세에는 위 예시 외에 해당 화면에 필요한 이전 응답·조건, 근거, 최근 발송 및 참조 링크를 포함한다.

## 5. 차수 시작·기업 탐색

| 번호 | API 제안 | 요청 body | 반환/권한 |
|---|---|---|---|
| 12 | `POST /cycle-start-intents` | 없음 | intentId, openedAt, expiresAt. PM |
| 13 | `POST /cycles/start-and-search` | name, intentId, expectedActiveCycleId(null 허용), searchOptionsVersion, filters | cycle + jobId. 202, PM |
| 14 | `POST /cycles/{cycleId}/searches` | searchOptionsVersion, filters | jobId. 202, 탐색 권한 |
| 15 | `GET /jobs/{jobId}` | 없음 | type, status, progress?, resultRefs, error, updatedAt |

filters: domainIds[], productTypeIds[], companySize?, sourceIds[], channelTypes[] 등 실제 지원하는 조건만. 제품 형태·규모·채널은 현재 UI 입력으로 모두 구현돼 있지 않으므로 추가 조건은 capability로 노출한다. source 선택과 관계자 연락 채널은 별개다.

12는 '버튼을 누른 시각'을 서버에 남기기 위한 **추가 설계 제안**이다. 현재 프론트는 브라우저 시각을 search.startedAt으로 보내므로 그대로 신뢰하면 안 된다. 서버 수신 시각을 차수 시작 기점으로 쓸지, 클라이언트 클릭 시각을 별도 보존할지 합의해야 한다. 취소된 intent는 활성 차수가 아니며 만료 처리한다.

13은 차수 확정과 작업 큐 등록을 내구성 있게 함께 처리한다. 이후 탐색이 실패해도 이미 열린 차수를 새로 만들지 않고 같은 차수에서 재시도한다. 활성 차수 동시 시작은 expectedActiveCycleId와 서버 제약으로 막는다. 추가 탐색(14)은 startedAt을 변경하지 않는다. 첫 설치의 차수 0개 상태를 지원해야 한다.

현재 프론트에는 활성 차수 0개 처리와 job UI가 없다. 새 adapter와 함께 이 상태를 추가한다. 작업 재시도는 실패 원인이 해소된 뒤 동일 차수에 새 탐색 실행을 만들 수 있지만, 단순 통신 재시도는 기존 Idempotency-Key로 조회/재사용한다.

## 6. 기업 검토·컨택 결정

아래 변경은 명시된 경우 외에 갱신된 outreach 상세를 반환한다. 기업 영구 제외는 company와 영향받은 컨택 목록/갱신 대상도 반환한다.

| 번호 | API 제안 | 필수 입력 | 검증 및 결과 |
|---|---|---|---|
| 16 | `POST /outreaches/{id}/approval` | expectedVersion, reviewNote?, conditionEvidence? | 검토 단계 확인 → 관계자 선택. 재접촉 메모 필수, 신규/다른 관계자/재협업 진행에는 사유 강제 안 함 |
| 17 | `POST /outreaches/{id}/skip` | expectedVersion, cycleId, note? | 이번 차수 건너뛰기, 다음 차수 검토 복귀. 신규 검토 불가, 재협업 사유 필수 |
| 18 | `POST /companies/{id}/exclusion` | expectedCompanyVersion, outreachId, expectedVersion, note? | 기업 영구 제외, 이후 차수 자동 복귀 안 함. 재협업 사유 필수 |

서버는 영구 제외/논의 중/차수 제한/실제 무응답 확인 여부를 검증한다. 영구 제외 이력은 삭제하지 않는다. 제외 복구 기능은 현재 UI에 없고 정책도 미정이므로 DELETE나 해제 API를 임의 추가하지 않는다.

## 7. 관계자 조사·수신자 선택

| 번호 | API 제안 | 필수 입력 | 결과 |
|---|---|---|---|
| 19 | `POST /outreaches/{id}/contact-searches` | expectedVersion, searchCriteria? | jobId, 202. 완료 후 07 조회 |
| 20 | `PUT /outreaches/{id}/recipient` | expectedVersion, contactId, endpointId | 선택 수신자, 초안 승인 무효화, 갱신 version |
| 21 | `POST /outreaches/{id}/recipient-review` | expectedVersion | 기존 초안 보존·승인 해제 → 관계자 선택 단계 |

직위·LinkedIn 활동을 검색 조건으로 쓸지 조사 결과로 보여줄지는 미정이다. searchCriteria를 확정 필수값으로 만들지 않는다. 조사 결과는 사실·출처 URL·조사 시각·미확인 여부를 구분한다. '미조사'를 게시물 수 0으로 바꾸지 않는다.

배포 전 접촉자와 무응답 경로의 이전 접촉자는 동일인 기준으로 제외한다. 서버는 후보 응답뿐 아니라 선택·생성·발송 시에도 재확인한다. 다른 채널 endpoint를 고르는 것으로 제외를 우회할 수 없다. 거절·보류 재접촉은 기존 담당자 선택을 지원한다.

현재 Contact.email 단일 필드와 selectRecipient(contactId)는 여러 채널을 표현할 수 없다. 운영 연결 전에 endpoints[]와 endpointId를 추가한다. 연락처가 없는 후보는 선택 불가 사유를 표시한다.

## 8. 초안 생성·저장·확정

| 번호 | API 제안 | 필수 입력 | 결과 |
|---|---|---|---|
| 22 | `POST /outreaches/{id}/draft-generations` | expectedVersion, recipientId, endpointId, topic? | jobId, 202. 실제 새 생성만 실행 |
| 23 | `GET /drafts/{draftId}` | 없음 | revision, topic, subject, body, recipient/endpoint, approvedRevision, templateUsed |
| 24 | `PATCH /drafts/{draftId}` | expectedVersion, expectedRevision, topic, subject, body | revision 증가, 승인 해제, 갱신 draft + outreach |
| 25 | `POST /drafts/{draftId}/approval` | expectedVersion, expectedRevision | approvedRevision, approvedAt/by, 갱신 outreach |
| 26 | `POST /outreaches/{id}/draft-review` | expectedVersion, draftId | 기존 초안 보존 → 초안 검토, 승인 해제. AI 호출 없음 |

현재 generateDraft 명령은 '새 생성'과 '기존 초안 이어보기'를 겸한다. 운영 adapter는 draft 존재 여부로 22와 26을 구분한다. 단순 열람은 23이며 비용·상태 변경을 유발하지 않는다.

서버는 지정 템플릿의 ID/version을 확정하고 생성 결과에 보존한다. 템플릿 미연결은 TEMPLATE_NOT_CONNECTED. 생성에 필요한 조사도 서버 작업 안에서 실행하며 브라우저에 LLM 키를 주지 않는다. 지정 템플릿 원문과 변수 계약은 수령 후 확정한다.

생성 작업 시작 시 컨택·수신자·초안 version을 캡처한다. 작업 완료 전에 사람이 수신자나 초안을 수정했다면 최신 편집을 덮어쓰지 않고 충돌 또는 검토할 별도 결과로 남긴다. 재생성·버전 복원은 현재 비활성/미구현이므로 별도 범위다.

초안 승인에는 저장된 최신 revision을 사용한다. 주제·제목·본문·수신 주소/수신자 변경은 재검토가 필요하다. 프론트는 미저장 상태에서 승인·발송을 막고 저장 실패 시 입력을 보존한다.

## 9. 발송: 두 방식 중 선택 필요

현재 recordSimulatedSend는 개발용이며 실제 운영 API로 그대로 배포하지 않는다. 아래 27과 28은 **선택지**다. 직접 발송 범위는 아직 확정하지 않았다.

| 번호 | API 제안 | 요청 | 의미 |
|---|---|---|---|
| 27 | `POST /outreaches/{id}/manual-send-records` | expectedVersion, draftId, approvedRevision, endpointId, cycleId, sentAt, channel, actualMessageSnapshot | 사람이 외부에서 발송한 사실 기록. 메일을 보내지 않음 |
| 28 | `POST /outreaches/{id}/send-requests` | expectedVersion, draftId, approvedRevision, endpointId, cycleId | 서비스가 실제 발송을 접수. sendId + queued, 202 |

27을 선택하면 UI를 '발송 완료 기록'으로 바꾼다. 실제 외부 발송 내용이 초안과 달라졌을 수 있으므로 실제 수신자·제목·본문 확인 절차가 필요하다. 수동 기록은 외부 발송 사실의 자동 검증을 의미하지 않는다. 이미 일어난 과거 발송이 정책을 위반하더라도 이력을 지우거나 허위 내용으로 맞추면 안 되므로 예외 기록/검토 정책을 합의한다.

28을 선택하면 서버가 인증·최신 승인·차수·동일인 제한을 검증하고 발송 내용을 고정한 후 외부 제공자와 통신한다. DB 저장과 외부 메일 전송은 하나의 트랜잭션이 아니므로 outbox/작업 큐 등 내구성 있는 방식과 제공자별 중복 전송 방지를 설계한다. 접수 이후 수정한 초안을 이미 접수한 메시지에 반영하지 않는다.

`GET /sends/{id}`는 queued/sending/sent/failed/unknown 상태를 반환한다. 결과 불명은 자동 새 발송하지 않고 기존 sendId로 조회·조정한다. 웹훅/제공자 결과 수집은 서버 내부 연동이며 UI가 직접 호출하는 API가 아니다. 수신함 응답 자동 판별은 현재 필수가 아니다.

현재 mock은 모든 동일 차수 재발송을 막는다. 확정 업무 규칙은 응답 미확인·무응답 기업에 대한 제한이다. 담당자 안내 등 예외는 미정이므로 mock의 보수적 차단을 모든 운영 사례의 최종 정책으로 확정하지 않는다.

## 10. 응답 확인·상태 기록

| 번호 | API 제안 | 필수 입력 | 결과 |
|---|---|---|---|
| 29 | `POST /outreaches/{id}/response-checks` | expectedVersion, sendId, result, category?, note?, revisitCondition? | response + 갱신 outreach + 가능한 다음 행동 |

sendId는 정상 신규 기록에서 필수다. 배포 전 이관처럼 sendId가 없는 경우는 legacyHistoryId 등 별도 참조로 표현하고 무관한 메시지에 연결하지 않는다.

응답 결과 코드 제안: no_reply/discussing/rejected/deferred/referred/closed. 사유 코드 제안: resource_shortage/not_interested/no_problem_demand/other. 화면 라벨과 저장 코드는 adapter에서 변환한다.

| 결과 | 반드시 지킬 처리 |
|---|---|
| 답변 없음 | 이번 차수는 재발송 금지 유지. 이전 차수이면 다른 관계자 재컨택 검토 가능 |
| 논의 시작 | 리스트업 제외, 이력은 보존. 수주 확정으로 간주하지 않음 |
| 거절 / 보류 | 카테고리 필수, 기타 설명 필수. 내부 영구 제외와 구분 |
| 담당자 안내 | 안내 내용 저장. 동일 차수 새 발송을 자동 허용하지 않음 |
| 연락 종료 | 종료 기록. 기업 영구 제외와 같다고 임의 확정하지 않음 |

checkedAt/checkedBy는 서버가 기록한다. 결과 변경은 이전 결과를 덮어 지우지 않고 새 이벤트를 쌓는다. 재논의 조건은 보류 메모이며 내부 skipForCycle과 다른 상태다.

현재 mock은 거절/보류 이후 stage=보류로 비활성 처리해 추가 응답 입력을 막는다. 운영에서는 새 답변 도착·오입력 정정·보류 후 재접촉을 어떻게 재개할지 결정하고 allowedActions와 UI를 함께 수정해야 한다. 종료 상태 해제/수주 확정 API는 이 정책 합의 전 필수 구현으로 넣지 않는다.

### 응답 저장 요청·응답 예시

```http
POST /api/v1/outreaches/outreach-001/response-checks
Idempotency-Key: response-check-001
Content-Type: application/json

{
  "expectedVersion": 4,
  "sendId": "send-001",
  "result": "deferred",
  "category": "resource_shortage",
  "note": "이번 일정에 참여하기 어려움",
  "revisitCondition": "다음 차수에 일정 확인"
}
```

```json
{
  "data": {
    "response": { "id": "response-002", "checkedAt": "2026-09-22T03:00:00Z", "checkedBy": "member-001" },
    "outreach": { "id": "outreach-001", "version": 5, "responseStatus": "deferred", "internalDecision": "active" },
    "invalidatedResources": ["company-001", "company-001:history"]
  },
  "requestId": "req-002"
}
```

실제 성공 응답은 06의 전체 상세 규격을 따르며 위 JSON은 축약 예시다. 외부 보류 때문에 내부 건너뛰기나 영구 제외로 자동 변경하지 않는다.

## 11. 비동기 작업·오류

job 상태: queued/running/succeeded/failed. 취소 기능은 현재 범위 밖이다. 작업은 회사/차수/컨택과 실행 요청을 참조하고, 재방문 시 상세 응답에서 activeJobIds를 찾을 수 있어야 한다. 폴링 간격은 Retry-After 또는 응답 pollAfterMs로 안내할 수 있다. 성공 후 resultRefs로 해당 목록/후보/초안을 다시 조회한다.

| HTTP / 코드 | 프론트 처리 |
|---|---|
| 401 UNAUTHENTICATED | 로그인/세션 갱신. 미저장 입력 보존 |
| 403 FORBIDDEN | 허용 범위 밖 데이터·동작 차단 |
| 404 NOT_FOUND | 삭제/접근 불가 안내, 목록으로 이동 가능 |
| 422 VALIDATION_ERROR | fieldErrors 표시, 입력 보존 |
| 409 VERSION_CONFLICT | 입력을 보존하며 최신 데이터 확인·재적용 |
| 409 ACTIVE_CYCLE_CHANGED | 현재 차수 재조회, 임의로 다른 차수에 저장하지 않음 |
| 409 INVALID_STATE | 상태와 allowedActions 갱신 |
| 409 SAME_CYCLE_BLOCKED | 추가 컨택 차단 사유 표시 |
| 409 CONTACT_EXCLUDED | 후보 재조회·수신자 재선택 |
| 409 TEMPLATE_NOT_CONNECTED | 연결 필요 안내, 신규 생성 비활성 |
| 409 IDEMPOTENCY_CONFLICT | 동일 키의 다른 요청 거부, 자동 재시도 금지 |
| 429 RATE_LIMITED | Retry-After에 맞춰 재시도 |
| 5xx / 통신 오류 | 실패/결과 불명 구분. 같은 operation key로 결과 확인 |

JOB_FAILED는 job.error, SEND_STATUS_UNKNOWN은 send.status/error에 표현한다. 발송 접수 후 제공자 불명 상태를 일반 저장 실패처럼 새 요청으로 반복하면 안 된다. 원문 조사/메시지 내용과 비밀키를 오류 응답·로그에 불필요하게 노출하지 않는다.

## 12. 현재 화면 밖의 확장 API

위 29개를 한 번에 만들라는 뜻이 아니다. 번호는 논리적 기능 목록이며 상세에 포함되는 조회, 발송 선택지, 시작 intent 제안을 포함한다.

| 영역 | 향후 API 후보 | 현재 판단 |
|---|---|---|
| 로그인/로그아웃 | 인증 공급자 세션/로그인/로그아웃 | 인증 방식 합의 후 SDK 또는 별도 경로. 자체 비밀번호 API 필수 아님 |
| 검색 소스·카테고리 관리 | GET/POST/PATCH sources, categories | 관리 UI 요구는 있었으나 지금 UI는 고정 선택지. 읽기는 03, 쓰기는 후속 |
| 기업 담당자 배정 | PATCH companies/{id}/owner | 지금은 담당자 필터만 있음. 배정 UI 추가 시 필요 |
| 기업 정보/관계자 수동 정정 | PATCH companies, contacts, endpoints | 자동 조사 데이터의 정정 권한·출처 보존 합의 후 |
| 지정 템플릿 연결 | PUT template-bindings/{route} | 관리자/배포 설정으로도 가능. 본문 편집 UI는 범위 밖 |
| 배포 전 LinkedIn 이관 | 내부 import job 및 동일인 매핑 | 일회성 관리 도구/스크립트로 가능. 일반 프론트 API 필수 아님 |
| 수주 확정/실패 | 결과 저장·프로젝트 연결 | 데이터 기준과 UI 미정 |
| Notion 동기화 | 연결 상태·동기화 job·충돌 해결 | 기준 DB와 단방향/양방향 정책부터 합의 |
| 재생성/이전 버전 복원 | draft regeneration / revision 조회·복원 | 현재 비활성/미구현. 별도 추가 범위 |

## 13. 구현 순서와 인수 기준

1. **인증·읽기:** 01~11 중 화면에 필요한 조회부터. ID/상태 enum, activeCycleId, 권한, pagination 합의. 새로고침·빈 목록·권한 없음·조회 실패 확인.
2. **저장:** 16~18, 20~21, 24~26, 29. 상태 전환과 이력을 원자 저장. 다른 계정에서도 결과 일치, 버전 충돌·필수 사유·저장 실패 입력 유지 확인.
3. **차수·조사·생성:** 12~15, 19, 22. 중복 접수 방지, 재방문 복구, 차수 재생성 없는 재시도, 생성 도중 편집 충돌 확인.
4. **발송:** 27 또는 28을 결정해 연결. 같은 차수 제한, 승인 revision, 실제 스냅샷, 실패/결과 불명 확인. 샘플 성공을 실제 발송 이력으로 이관하지 않음.
5. **확장:** 수주 결과·Notion·소스 관리 등 별도 합의 후 추가.

## 14. 팀원이 먼저 답해주면 되는 항목

- HTTP API / RPC / 서버 함수 중 연결 방식과 인증 방식.
- companyId / outreachId / cycleId / draftId / endpointId 구분 및 차수별 복수 컨택 허용 여부.
- 처음 차수 0개와 새 차수 클릭 시각의 서버 기록 방법.
- 담당자 안내·연락 종료·거절/보류 후 새 응답 및 재검토 허용 규칙.
- 사람이 외부 발송 후 기록(27)인지 실제 자동 발송(28)인지.
- 작업 큐·폴링/실시간 조회 방식, 버전 충돌·멱등키 보존 규격.
- 실제 지정 템플릿 원문, 변수 및 버전 제공 방식.

이 문서는 현재 프론트의 모든 repository 명령을 대응시키고 운영에 필요한 조회·비동기·권한 경계를 추가한 제안이다. 아직 서버 구현이나 frontend adapter 연결을 수행하지 않았다.
