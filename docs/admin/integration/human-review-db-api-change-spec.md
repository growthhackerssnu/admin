# 기업 수집·사람 판단 전환 — DB/API 변경 명세

작성: 2026-10-01, 검증 현황 갱신: 2026-10-02. **구현 계약 초안**. `packages/db/schema.prisma`와 `apps/backend`의 API를 기준으로 작성했습니다. 기존 DB를 확인하고 신규 확장 마이그레이션 두 건을 적용했으며, 수집·조회 일부를 실데이터로 확인했습니다. Gemini 조사 성공 이후의 전체 흐름은 아직 검증되지 않았습니다. 현재 브랜치의 구현·검증 순서는 [작업 목록](human-review-implementation-checklist.md)을 따릅니다.

[테이블별 AS-IS / TO-BE](human-review-schema-comparison.md) · [API AS-IS](human-review-api-as-is.yaml) · [API TO-BE](human-review-api-to-be.yaml)

## 1. 기준 흐름

1. **수집 cron:** StartupRecipe 주간 웹 아카이브에서 기업명과 한 줄 설명을 적재한다. Gmail은 후속 연결이다.
2. **조사 cron:** 적재한 후보를 조사해 사람이 fit을 판단할 자료와 출처를 저장한다. AI fit 판정·자동 연락처 조사·후보 탈락은 실행하지 않는다.
3. **회차 배정:** 팀장이 조사 완료·미검토·미배정 큐의 현재 수량을 보고 작업 기간, 참여 팀원, 팀원당 건수를 정한다. 확정 시 고른 후보 ID와 담당자를 고정한다. 이후 들어온 후보나 빨리 처리한 사람에게 새 건을 자동 보충하지 않는다.
4. **사람 검토:** 각 담당자가 배정된 기업의 자료로 fit을 판단하고 LinkedIn/메일 관계자를 직접 찾는다. 승인 / fit 부적합 거절 / 연락처 없음 거절을 기록한다. 다른 팀원의 기업은 볼 수 있지만 수정할 수 없다.
5. **메시지 준비:** 새 후보는 사람 승인 후, 과거 프로젝트 기업은 기업 이력에서 시작한다. 이번 범위는 기업당 첫 발송 한 번이다. 목표 분기와 수신자를 정하고 버튼으로 AI 메시지를 생성한다. 새 후보는 저장된 조사를, 과거 프로젝트 기업은 협업 이력과 사람이 입력한 연락 목적을 근거로 사용한다. 추가 검색은 없다. 이미 발송한 기업은 이력만 조회한다.
6. **사람 전송:** 내용을 수정·복사하고 외부 채널에서 전송한 뒤 완료를 기록한다. 별도 초안 승인 단계는 두지 않는다.

기업 목록은 분기와 무관하게 쌓인다. 목표 분기는 제안하는 프로젝트의 진행 분기이며 메시지 준비에 속한다. 기술 오류는 사람의 거절과 구분한다.

## 2. 이전 TO-BE에서 바로잡은 항목

| 문제 | 수정 |
|---|---|
| SearchRun의 분기·담당자를 유지하면서 CollectionRun을 별도 추가 | SearchRun을 수집 실행으로 재정의. 분기·담당자·사용자 생성자 제거. CollectionRun 추가 철회 |
| AI 평가/자동 연락 조사 컬럼을 활성 TO-BE에서 유지 | 후보의 AI 평가 참조·effectiveFit·자동 연락 조사 상태/카운트 제거 |
| 조사 실행이 탐색 배치에 종속 | ResearchTask는 candidateId 기준. CompanyResearch는 taskId 기준 |
| 기존 fit/연락처 평가를 새 판단과 병행 | 사람 판단은 CandidateReviewDecision으로 통합. 기존 평가는 과거 기록으로 보관 |
| 수동 연락처 입력에도 자동 검증 등급 유지 | Contact/Endpoint는 사람이 찾은 정보와 기록 주체를 저장. 자동 점수·등급 제거 제안 |
| Outreach에 검토·skip·승인·중복 초안 포인터 혼재 | 판단은 Candidate, 메시지·분기는 Outreach, 발송 사실은 SentMessage로 구분 |
| 초안 승인 API를 필수 절차로 유지 | 별도 승인 제거. 현재 초안과 수신자·분기 일치 여부는 저장/발송 기록 시 검증 |
| ResearchIdea 별도 테이블을 필수 제안 | 철회. 저장된 조사 자료에서 메시지 아이디어 생성 가능 |
| 과거 기록 보존과 최종 스키마 혼합 | 최종 TO-BE와 이관용 임시 호환 필드를 분리 |

이름·enum·제약은 구현 제안이다. 공유 필드의 물리 제거는 다른 기능 사용처와 데이터 이관 검증 후 진행한다.

## 3. 단계별 데이터 책임

| 단계 | 데이터 | 분기 / 사람 |
|---|---|---|
| 소스 설정 | CollectionSource: 종류, URL/설정, 추출 규칙 버전 | 둘 다 없음 |
| 수집 실행 | SearchRun: sourceId, scheduledFor, 설정 스냅샷, 실행 결과 | 둘 다 없음 |
| 원문 처리 | CollectionItem: 원문 고유 키, 처리 상태, 오류·재시도 | 둘 다 없음 |
| 기업 적재 | CollectedCompany: 이름·설명, CompanyNameKey: 중복 키, Candidate: 검토 목록 | 분기 없음, 최초엔 담당자 없음 |
| AI 조사 | ResearchTask → CompanyResearch → ResearchClaim/Evidence | 분기 없음, 사람 승인 불필요 |
| 회차 배정 | ReviewAssignmentBatch/Item: 작업 기간·확정 시점의 대상 ID·팀원별 고정 건수, Candidate.reviewOwnerId | 목표 분기 없음. 팀장만 확정 |
| 사람 판단 | CandidateReviewDecision, Contact/ContactEndpoint | 검토 사용자 기록. 분기 없음 |
| 메시지 준비 | Outreach, MessageDraftRevision, 기존 Job | 분기 선택. 새 후보의 담당자는 후보에서 이어받고 기존 기업은 현재 사용자를 기록 |
| 전송 기록 | SentMessage | 당시 제안한 프로젝트 목표 분기·실제 발송 시각·수신자·본문·기록 사용자 보존 |

### 수집과 조사

- SearchRun은 원문 추출 완료 시 끝난다. 후속 기업 조사 완료를 기다리지 않는다.
- 원문 UQ(sourceId,externalKey), 실행 UQ(sourceId,scheduledFor), 현재 소스 내 이름 UQ(sourceId,normalizedName)로 재실행 중복을 막는다.
- 이름 정규화는 NFKC·공백 정리·영문 소문자화 제안이다. 동명·표기 변경을 완벽히 식별한다는 뜻은 아니다. 다른 소스 추가 시 동일성 규칙을 다시 검토한다.
- Company·이름 키·Candidate 생성은 같은 트랜잭션. 중복 기업은 신규 목록에 추가하거나 기존 조사/판단을 덮어쓰지 않는다.
- 조사 cron은 queued 후보를 처리한다. 성공 결과와 currentResearchId·ready·revision을 원자 갱신한다. 실패는 error로 보존한다.
- 활성 조사 작업은 후보당 하나. 작업 claim과 leaseToken으로 동시 처리·늦은 결과 덮어쓰기를 방지한다. 주기·횟수·예산은 운영 설정이다.

### 사람 판단과 관계자

- researchStatus: queued/running/ready/error. reviewStatus: unreviewed/reviewing/approved/rejected_fit/rejected_contact.
- reviewing은 입력 저장 중이라는 뜻이다. 별도 검토 시작·업무 승인 버튼을 추가하지 않는다.
- approve는 fit 적합 + 사람이 저장한 관계자, reject_fit은 fit 부적합, reject_contact는 fit 적합 + 연락처 미확보다.
- 판단 이력은 당시 조사 버전과 관계자를 참조한다. 재검토는 이전 판단을 지우지 않는다.
- 새 후보의 첫 관계자/판단 저장으로 담당자를 선점하지 않는다. 배정 회차에 속한 담당자만 수정할 수 있고, 다른 팀원은 조회만 가능하다. 수집·조사 시점에는 담당자가 없다.
- 주소 형식과 회사 소속을 검사하되 입력 저장이 실제 전송 가능성의 자동 검증을 뜻하지 않는다.

### 고정 배정과 유입 제어

- 배정 가능 수량은 `researchStatus=ready`, `reviewStatus=unreviewed`, `reviewOwnerId=null`, 기존 Outreach·PastProject 없음인 신규 리스트업 후보만 센다. 기존 관계 기업은 이번 회차에 섞지 않는다. 조사 대기·진행·오류, 이미 처리·배정된 후보는 별도 수량으로 보여준다.
- 팀장은 시작일·종료일, 활성 대외협력 팀원, 팀원당 건수를 입력한다. 선택 총량은 `팀원 수 × 팀원당 건수`이며 배정 가능 수량을 넘기면 확정할 수 없다. 배정 후보는 오래 기다린 순(`Candidate.createdAt`, `id`)으로 제안하고 확정 전에 정확한 기업 목록과 팀원별 배분을 보여준다.
- 확정 요청은 미리 본 후보·팀원 대응과 조건을 다시 받고, 후보 ID가 여전히 배정 가능한지와 팀원별 건수를 검사한 뒤 ReviewAssignmentBatch/Item과 Candidate.reviewOwnerId를 원자 저장한다. 새 후보가 중간에 들어와도 요청한 ID 외에는 이번 회차에 추가하지 않는다. 동일 후보의 중복 배정은 DB unique와 조건부 변경으로 막는다.
- 확정된 건수는 처리 속도와 무관하게 유지한다. 기간 종료만으로 미완료 건을 자동 거절하거나 재배정하지 않는다. 재배정·기간 연장·미완료 정리는 별도 관리 동작으로 정한다.
- 팀장의 **유입 일시정지**는 이후 시작할 수집 cron만 막는다. 현재 진행 중인 수집·조사 및 이미 확정된 회차·담당자의 작업은 계속된다. `CollectionSource.enabled`는 소스별 활성화이고 전체 일시정지와 별개다. 스냅샷만으로 신규 유입을 이번 회차에서 제외할 수 있으므로 일시정지는 필수가 아니다.

### 메시지와 발송

- Outreach는 분기를 선택한 메시지 준비 시 생성한다. 승인된 후보가 목록에 남아 있는 동안에는 분기가 필요 없다. 기존 기업은 `Company`에서 직접 새 연락 업무를 만들 수 있어야 하며, 후보/현재 조사/새 사람 판단을 허위로 만들지 않는다.
- 기존 기업 경로의 최소 근거는 실제 저장된 `PastProject` 이력과 사람이 입력한 연락 목적이다. `Outreach`나 발송 기록이 없어야 새 업무를 생성한다. 관계자와 연락 경로는 사람이 확인·선택한다. 근거가 없거나 이미 발송했다면 생성 가능으로 표시하지 않는다.
- 새 후보의 생성 입력은 저장된 claims/evidence, 사람이 저장한 수신자, 선택 분기, 내부 협업 사례·템플릿·대외협력팀장 정보다. 과거 프로젝트 기업의 생성 입력은 협업 이력, 사람이 입력한 연락 목적, 선택 수신자·분기, 템플릿·내부 발신자 정보다. 두 경로 모두 생성 중 웹 검색하지 않는다.
- 초안에는 선택 수신자·분기 및 사용한 근거를 고정한다. 새 후보는 generationResearchId/generationReviewDecisionId를, 과거 프로젝트 기업은 사용한 PastProject ID와 연락 목적 스냅샷을 남긴다. 과거 불명 값은 추정하지 않는다.
- 기업당 `Outreach`는 한 건이며 `companyId` 유니크 제약을 유지한다. 이번 범위는 기업당 첫 발송 한 번으로 제한한다. 미발송 업무는 이어서 준비하고 이미 발송한 업무는 읽기만 허용한다.
- 현재 초안 포인터는 currentRevision 하나로 통합한다. approvedRevision과 별도 approval 호출은 제거한다.
- 입력 변경 후 이전 문안이 자동으로 현재 수신자·분기에 맞는 것으로 취급되지 않도록 생성/수정/기록 시 일치 검증한다. 사람 수정으로 바뀐 문안을 저장할 때 실제 현재 문맥을 연결한다.
- 발송 상태는 before_send/sent. 생성 중·생성 오류는 Job 상태다. SendStatus에 수주 의미를 넣지 않는다.
- 사람의 완료 기록 요청만 SentMessage를 생성한다. 복사나 LinkedIn 열기를 전송 완료로 처리하지 않는다. recordedById와 sentAt/createdAt을 구분한다.
- `SentMessage.targetQuarterId`는 제안한 프로젝트의 목표 분기다. 실제 메시지를 보낸 달력 분기는 `sentAt`을 한국 시간으로 변환해 구한다. 두 분기를 같은 값으로 취급하지 않는다.
- 수주 여부는 발송 상태와 별개다. 현재 `Response` 결과값과 `PastProject`만으로 각 발송의 수주를 확정하기는 어렵다. 별도의 확정 기록과 집계 마감 기준은 후속 계약에서 정한다. 기록이 없다는 이유만으로 진행 중인 건을 최종 실패로 단정하지 않는다.
- UNIQUE(outreachId,draftRevision)로 완료 클릭 재시도를 중복 기록하지 않는다. 이번 범위의 두 번째 발송은 업무 상태와 기존 SentMessage 존재 검사로 막는다.

## 4. API 변경 계약

전체 필드는 TO-BE YAML을 따른다. AS-IS YAML은 기존 구현 관찰 기록으로 그대로 둔다. YAML에는 DTO별 저장 테이블 매핑, 각 API의 읽기/쓰기 대상·응답·버전 조건을 포함한다. 내부 cron은 HTTP endpoint와 분리한다.

| 경로 | 변경 |
|---|---|
| 수집·조사 내부 cron | sourceId/실행 시각으로 수집, 후보 ID로 조사. 분기·담당자 입력 없음 |
| GET /review-queue/summary | 현재 배정 가능·조사 중·오류·이미 배정된 후보 수와 전체 유입 상태 조회 |
| GET /review-assignment-members | 현재 배정 가능한 활성 대외협력 팀원 조회. 팀장·관리자 전용 |
| POST /review-assignment-batches/preview | 기간·팀원·팀원당 건수로 실제 배정될 후보·팀원 대응 미리보기 |
| POST /review-assignment-batches | 미리 본 후보 ID를 검증해 회차와 담당자를 원자 확정 |
| GET /review-assignment-batches/:id | 확정된 회차의 기간·참여자·기업·처리 상태 조회 |
| GET/PATCH /collection-intake | 전체 신규 수집 실행의 일시정지 상태 조회·변경. 기존 작업은 유지 |
| GET /review-candidates 및 /:id | 조사 상태·사람 판단·관계자·오류 반환. AI fit와 분기로 목록을 제한하지 않음 |
| PUT /review-candidates/:id/recipient | 사람이 찾은 관계자 저장. 자동 연락처 평가 호출 없음 |
| POST /review-candidates/:id/decisions | 승인·거절·재검토 이력 저장. 조사나 메시지를 자동 생성하지 않음 |
| POST /review-candidates/:id/research-retries | 기술 오류 재시도. 사람의 거절로 변환하지 않음 |
| POST /review-candidates/:id/outreaches | 승인 후보와 선택한 targetQuarterId로 메시지 업무 생성 |
| POST /companies/:id/outreaches | 과거 프로젝트가 있고 아직 Outreach·발송 기록이 없는 기업의 첫 업무 생성 |
| GET /review-outreaches/:id | 메시지 업무·현재 초안·발송 기록 조회 |
| PATCH /review-outreaches/:id/recipient | 재검토·재승인된 후보 관계자를 발송 전 메시지 업무에 반영 |
| PATCH /review-outreaches/:id/target-quarter | 초안 문맥 변경. 과거 발송의 목표 분기·시각은 불변 |
| POST /review-outreaches/:id/draft-generation | 승인·조사·관계자·분기를 확인한 후 저장 자료로 초안 생성. 추가 검색 없음 |
| GET/PATCH /review-outreaches/:id/draft | 버전별 초안 조회·수정. 별도 승인 상태 없음 |
| POST /drafts/:outreachId/approval | 새 흐름에서 제거 |
| POST /review-outreaches/:id/send-records | 사람이 전송한 사실을 현재 초안 스냅샷으로 기록 |
| GET /sends/:sendId, GET/POST /target-quarters | 기존 조회/분기 생성 계약 재사용 |

신규 리스트업 경로는 현재 브랜치에 구현돼 있다. 과거 프로젝트 기업의 신규 연락 업무와 과거 발송 기업의 재접촉은 이번 연결 범위에서 보류한다. 기존 `/search-runs`의 사용자 분기 입력·배치 담당자 권한과 AI followup은 새 흐름의 호출 경로에서 사용하지 않는다.

공통: 기존 인증/역할 유지, 후보 expectedRevision 및 메시지 expectedVersion 검사, 동일 요청 재시도는 동일 Idempotency-Key. 다른 내용에 같은 키를 쓰면 409. 관련 저장은 트랜잭션으로 묶는다. 400 입력 오류, 403 권한, 404 없음, 409 버전/상태 충돌, 422 필수 조사·판단·관계자·분기 누락을 구분한다.

## 5. 이관 — 최종 구조와 별도

1. 다른 기능의 공유 테이블 사용처, 기존 활성 작업과 FK, 발송/초안 수를 조사한다.
2. 추가 필드와 임시 nullable 호환 구조로 확장한다. 기존 SearchRun 여러 소스와 새 단일 소스 실행의 대응을 검증하고 원본 스냅샷을 보관한다.
3. AI 평가·연락 평가·이전 판단·탐색 분기/담당자는 과거 자료로 보존한다. 새 승인으로 자동 변환하지 않는다.
4. 기존 발송 및 진행 업무는 새 미검토 목록에 자동 유입시키지 않는다. 후보 없는 기존 Outreach/초안/발송의 새 참조는 null 허용한다.
5. 기존 연락처 URL을 endpoint로 옮기고 공용 주소·중복 이름·초안 포인터 충돌을 분리 점검한다. 추정 병합하지 않는다.
6. 기존 worker와 클라이언트 전환 및 참조 무결성을 검증한 후 활성 모델의 구필드/구테이블을 제거한다. 임시 호환 플래그는 최종 도메인 필드가 아니다.
7. 실제 API 연결과 기본 화면 전환은 후속 작업으로 둔다.

Rollback은 새 cron/쓰기를 중지하고 보존한 데이터로 복구하는 절차를 준비한다. 새 사용자 판단·전송 기록을 삭제하는 down migration은 사용하지 않는다.

## 6. 검증 조건

- 분기·담당자 없이 수집→기업 적재→조사 완료 가능.
- 팀장이 배정 가능 수량을 보고 팀원당 동일 건수를 확정할 수 있음. 확정 이후 신규 후보와 처리 속도는 기존 회차의 기업 수를 바꾸지 않음.
- 다른 팀원 후보는 조회 가능하지만 관계자·판단·메시지·발송 기록은 담당자 외에 변경할 수 없음. 서버에서 권한 검사.
- 유입 일시정지 중 새 수집 실행이 시작되지 않으며 이미 진행 중인 조사와 배정된 작업은 계속됨.
- 동일 원문/기업 동시 수집에도 중복 후보 없음.
- AI fit 평가 0건이어도 사람이 검토·승인·메시지 생성 가능.
- 후보가 없는 과거 프로젝트 기업도 발송 전이라면 프로젝트 이력과 사람이 입력한 목적을 근거로 첫 메시지를 생성할 수 있음. 현재 조사·새 승인 이력을 조작해 채우지 않음.
- 조사 실패는 목록에서 error이며 거절이 아님.
- 연락처는 사람이 입력하며 자동 연락 조사 job이 발생하지 않음.
- 승인만으로 분기 지정/메시지 자동 생성 없음.
- 분기·관계자·조사 문맥이 바뀐 오래된 생성 결과 저장 차단.
- 별도 초안 승인 API 없이 수정→복사→외부 전송→완료 기록 가능.
- 같은 완료 요청 중복 방지, 이후 분기/관계자 변경에도 과거 전송 스냅샷 불변.

이번 검수는 문서의 흐름·필드 책임과 YAML 구문 확인입니다. 실제 migration·API 기능·실데이터 검증은 아직 하지 않았습니다.

## 7. API 구체화 시 추가한 구현 제안

- 판단 완료 후 관계자를 바꾸려면 재검토 후 재승인한다. 기존 판단 기록을 새 관계자에 그대로 적용하지 않는다.
- 후보 관계자와 메시지 수신자는 별도 저장 위치다. 메시지 화면은 필요할 때 수신자 반영 API를 호출한다. 기존 발송 스냅샷은 바꾸지 않는다.
- 생성은 현재 구현처럼 완료 후 201 응답한다. 생성 실패 시 기존 초안을 보존한다.
- 현재 문맥과 초안이 다르면 응답의 contextMismatchReasons로 표시한다. 문맥을 바꾼 수정 요청은 화면에서 확인한 문맥도 함께 보내고 서버가 비교한다. 별도 승인 버튼은 없다.
- 발송 완료된 업무의 수신자·분기·초안 변경과 두 번째 발송은 이번 범위에서 막는다. 과거 업무와 발송 내용은 읽기만 허용한다.
- sentAt은 실제 전송 시각, createdAt은 기록 저장 시각이다. sentAt 생략 시 서버 현재 시각을 사용한다.
