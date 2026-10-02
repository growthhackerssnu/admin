# 사람 검토 전환: 테이블별 AS-IS / TO-BE

기준: 2026-10-01 로컬 `packages/db/schema.prisma`. 운영 DB 조회 결과가 아닙니다. TO-BE는 최종 업무 모델이며, 현재 브랜치에는 기존 행을 보존하는 nullable 확장 마이그레이션 초안만 작성했습니다. DB에는 아직 적용하지 않았습니다.

각 표는 **한 행에 한 컬럼**을 대응시키고, 설명 열에서 저장하는 내용과 용도를 한 줄로 풀이합니다. 기존 테이블은 실제 저장 컬럼을 표시하고, Prisma의 관계 탐색용 필드는 제외합니다. `?`는 nullable, `FK → 테이블.컬럼`은 참조 대상까지 표시한 외래키이며, UQ는 unique 제약입니다. 이름은 Prisma 필드명입니다.

**이번 수정 기준:** 수집·AI 조사에는 분기와 업무 담당자를 요구하지 않습니다. 사람이 fit·관계자를 확인한 뒤 메시지 준비에서 분기를 선택합니다. 표의 **제거 제안**은 최종 TO-BE에서 해당 컬럼 또는 테이블을 제외한다는 뜻입니다. 과거 데이터 보존·이관은 별도 절차이며 즉시 삭제를 뜻하지 않습니다.

**이관 중 물리 표현:** 기존 실행·후보·초안 행이 남아 있으므로 새 상태와 참조는 우선 nullable입니다. 신규 API는 해당 경로의 필수값을 검증합니다. 최종 표의 필수·제거 제안과 현재 마이그레이션의 컬럼 제약을 혼동하지 않습니다.

## 1. SearchRun

물리 테이블: `search_runs`

소스에서 기업명과 한 줄 설명을 모으는 자동 수집 실행입니다. 기존 SearchRun의 역할을 좁히며 CollectionRun을 별도로 추가하지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `targetQuarterId` — String · FK → `TargetQuarter.id` | 제거 제안 | 자동 수집 실행에는 목표 분기·업무 담당자·사용자 생성자를 두지 않습니다. |
| `conditionsSnapshot` — Json | `conditionsSnapshot` — Json | 실행 당시 소스·추출 규칙 설정만 보관하며 분기와 AI fit 기준은 포함하지 않습니다. |
| `status` — SearchRunStatus | `status` — enum(queued/running/completed/partial/failed) | 기업 수집 실행 결과이며 사람 판단이나 메시지 상태가 아닙니다. |
| `duplicateExcludedCount` — Int | `duplicateExcludedCount` — Int · 유지 | 해당 탐색에서 중복으로 제외한 기업 수입니다. |
| `finishReason` — String? | `finishReason` — String? · 유지 | 실행이 종료된 이유를 기록합니다. |
| `assignedMemberId` — String · FK → `Member.id` | 제거 제안 | 자동 수집 실행에는 목표 분기·업무 담당자·사용자 생성자를 두지 않습니다. |
| `createdById` — String · FK → `Member.id` | 제거 제안 | 자동 수집 실행에는 목표 분기·업무 담당자·사용자 생성자를 두지 않습니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |
| `startedAt` — DateTime? | `startedAt` — DateTime? · 유지 | 실제 처리를 시작한 시각입니다. |
| `finishedAt` — DateTime? | `finishedAt` — DateTime? · 유지 | 처리를 끝낸 시각입니다. |
| 없음 | `sourceId` — String · FK → `CollectionSource.id` · 추가 | 이번 실행이 기업을 수집하는 소스입니다. |
| 없음 | `scheduledFor` — DateTime · 추가 | 정기 실행 예정 시각으로 같은 cron 실행의 중복을 막습니다. |

**처리 방식·제약:** UQ(sourceId,scheduledFor). 기존 분기 인덱스 제거. 조사 완료를 기다리지 않고 원문 추출 완료로 종료합니다. 과거 실행의 제거 대상 값은 이관 보존합니다.

## 2. Candidate

물리 테이블: `candidates`

수집된 기업의 검토 대기 목록 한 건입니다. 조사 상태와 사람의 검토 결과만 업무 상태로 사용합니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `originSearchRunId` — String · FK → `SearchRun.id` | `originSearchRunId` — String? · FK → `SearchRun.id` | 최초 수집 실행의 추적용 참조입니다. 분기와 담당자를 상속하지 않으며 과거 출처만 있는 이관 후보를 허용합니다. |
| `companyId` — String · FK → `Company.id` | `companyId` — String · FK → `Company.id` · 유지 | 이 기록이 속한 기업의 ID입니다. |
| `discoveryEvidenceIds` — String[] | `discoveryEvidenceIds` — String[] · 유지 | 후보를 발견한 근거 기록들의 ID 목록입니다. |
| `currentResearchId` — String? · FK → `CompanyResearch.id` | `currentResearchId` — String? · FK → `CompanyResearch.id` · 유지 | 후보 화면에서 현재 사용하는 조사 버전의 ID입니다. |
| `latestSystemAssessmentId` — String? · FK → `FitAssessment.id` | 제거 제안 | AI 평가·자동 연락처 조사·임시 호환 플래그는 최종 후보 모델에서 제거합니다. |
| `activeHumanDecisionId` — String? · FK → `HumanFitDecision.id` | 제거 제안 | AI 평가·자동 연락처 조사·임시 호환 플래그는 최종 후보 모델에서 제거합니다. |
| `effectiveFit` — FitVerdict? | 제거 제안 | AI 평가·자동 연락처 조사·임시 호환 플래그는 최종 후보 모델에서 제거합니다. |
| `contactResearchStatus` — ContactStatus | 제거 제안 | AI 평가·자동 연락처 조사·임시 호환 플래그는 최종 후보 모델에서 제거합니다. |
| `usableContactCount` — Int | 제거 제안 | AI 평가·자동 연락처 조사·임시 호환 플래그는 최종 후보 모델에서 제거합니다. |
| `needsVerificationContactCount` — Int | 제거 제안 | AI 평가·자동 연락처 조사·임시 호환 플래그는 최종 후보 모델에서 제거합니다. |
| `unusableContactCount` — Int | 제거 제안 | AI 평가·자동 연락처 조사·임시 호환 플래그는 최종 후보 모델에서 제거합니다. |
| `revision` — Int | `revision` — Int · 유지 | 동시 수정 충돌을 감지하기 위한 후보 변경 번호입니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |
| `updatedAt` — DateTime | `updatedAt` — DateTime · 유지 | 이 기록이 마지막으로 수정된 시각입니다. |
| 없음 | `originCollectedCompanyId` — String? · FK → `CollectedCompany.id` · UQ · **추가** | 새 수집 과정에서 이 후보를 처음 만든 기업 추출 기록의 ID입니다. |
| 없음 | `researchStatus` — enum(queued/running/ready/error) · **추가** | 기업 자료 조사가 대기·진행·완료·오류 중 어디에 있는지 나타냅니다. |
| 없음 | `reviewStatus` — enum(unreviewed/reviewing/approved/rejected_fit/rejected_contact) · **추가** | 사람의 미검토·검토 중·승인·이유별 거절 상태입니다. |
| 없음 | `reviewOwnerId` — String? · FK → `Member.id` · **추가** | 이 후보의 검토를 맡은 내부 사용자의 ID입니다. |
| 없음 | `selectedContactId` — String? · FK → `Contact.id` · **추가** | 사람이 연락 대상으로 저장한 관계자의 ID입니다. |
| 없음 | `selectedEndpointId` — String? · FK → `ContactEndpoint.id` · **추가** | 선택한 관계자에게 연락할 이메일 또는 프로필 기록의 ID입니다. |
| 없음 | `activeReviewDecisionId` — String? · FK → `CandidateReviewDecision.id` · **추가** | 새 흐름에서 현재 유효한 사람 검토 결정의 ID입니다. |

**처리 방식·제약:** companyId UQ. 새 후보는 originCollectedCompanyId 필수이며 해당 원문의 firstRunId와 originSearchRunId 일치. 수집·조사 시 reviewOwnerId는 null이고, 팀장이 배정 회차를 확정할 때만 담당자를 설정합니다. reviewing은 입력 저장으로 진입하며 별도 검토 시작 버튼 없음. 분기 필드 없음.

## 3. CompanyResearch

물리 테이블: `company_researches`

AI가 정리한 기업 자료의 버전입니다. fit 판정이나 연락처 확보 여부를 평가하지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `companyId` — String · FK → `Company.id` | `companyId` — String · FK → `Company.id` · 유지 | 이 기록이 속한 기업의 ID입니다. |
| `originSearchRunId` — String · FK → `SearchRun.id` | 제거 제안 | 수집 실행과 조사 실행을 분리합니다. 발견 출처는 Candidate, 조사 실행은 taskId로 추적합니다. |
| `taskId` — String? | `taskId` — String? · FK → `ResearchTask.id` · UQ | 조사 결과를 만든 작업입니다. 신규 결과는 필수이고 과거 연결 불명 자료만 null 허용합니다. |
| `missingInformation` — String[] | `missingInformation` — String[] · 유지 | 조사 결과에서 확인하지 못한 정보 목록이며 UI 필수 노출을 뜻하지 않습니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |

**처리 방식·제약:** CompanyResearch.companyId와 task의 candidate.companyId 일치 검증. 성공 저장 후에만 currentResearchId 교체. 사실·추론·출처는 ResearchClaim/Evidence 재사용.

## 4. ResearchTask

물리 테이블: `research_tasks`

별도 조사 cron이 처리할 기업 조사 작업입니다. 수집 cron은 이 작업의 완료를 기다리지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `searchRunId` — String · FK → `SearchRun.id` | 제거 제안 | 기업 조사 작업은 수집 실행이나 AI 후속 판단 체인에 종속되지 않습니다. |
| `jobId` — String? | `jobId` — String? · 유지 | 연결된 실행 작업의 외부 또는 내부 job 식별자입니다. |
| `candidateId` — String? · FK → `Candidate.id` | `candidateId` — String · FK → `Candidate.id` | 조사할 후보입니다. 모든 신규 조사 작업에 필수입니다. |
| `parentTaskId` — String? · FK → `ResearchTask.id` | 제거 제안 | 기업 조사 작업은 수집 실행이나 AI 후속 판단 체인에 종속되지 않습니다. |
| `type` — ResearchTaskType | `type` — company_research | 이 흐름은 기업 정보 조사만 실행합니다. AI fit 평가·연락처 조사·연락처 검증 작업은 제거합니다. |
| 없음 | `pipeline` — enum(legacy/human_review) · 이관 중 추가 | 구 worker와 새 조사 cron의 작업을 구분합니다. 기존 행은 legacy, 새 후보 작업은 human_review입니다. 구 worker는 human_review를 선점하지 않습니다. |
| `trigger` — ResearchTaskTrigger | `trigger` — enum(cron/retry) | 정기 조사 또는 오류 재시도로 실행한 작업인지 구분합니다. |
| `requestedInformation` — String[] | `requestedInformation` — String[] · 유지 | 이번 작업에서 추가로 알아내도록 요청한 정보 목록입니다. |
| `followupPolicy` — FollowupPolicy | 제거 제안 | 기업 조사 작업은 수집 실행이나 AI 후속 판단 체인에 종속되지 않습니다. |
| `status` — ResearchTaskStatus | `status` — ResearchTaskStatus · 유지 | 조사 작업의 대기·진행·성공·실패·취소 상태입니다. |
| `attempt` — Int | `attempt` — Int · 유지 | 해당 작업 또는 원문 처리를 시도한 회차입니다. |
| `resultRefs` — Json | `resultRefs` — Json · 유지 | 작업이 생성한 조사 결과 등 산출물의 참조 정보를 저장합니다. |
| `errorCode` — String? | `errorCode` — String? · 유지 | 실패 원인을 프로그램에서 구분하기 위한 오류 코드입니다. |
| `errorMessage` — String? | `errorMessage` — String? · 유지 | 실패 원인을 설명하는 메시지입니다. |
| `errorRetryable` — Boolean? | `errorRetryable` — Boolean? · 유지 | 실패한 조사 작업을 재시도할 수 있는지 나타냅니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |
| `startedAt` — DateTime? | `startedAt` — DateTime? · 유지 | 실제 처리를 시작한 시각입니다. |
| `finishedAt` — DateTime? | `finishedAt` — DateTime? · 유지 | 처리를 끝낸 시각입니다. |
| 없음 | `leaseToken` — String? · **추가** | 현재 처리 권한을 가진 worker를 식별해 오래된 작업의 덮어쓰기를 막습니다. |
| 없음 | `leaseUntil` — DateTime? · **추가** | worker가 가진 임시 처리 권한이 만료되는 시각입니다. |

**처리 방식·제약:** 활성 queued/running 작업은 후보당 하나. leaseToken 확인 후 결과 저장. 실패 시 후보를 보존하고 researchStatus=error. 기존 다른 유형 작업은 이관 보관 후 활성 큐에서 제외합니다.

## 5. HumanFitDecision

물리 테이블: `human_fit_decisions`

과거 기록 보존 대상입니다. 새 업무 모델에서는 생성하거나 필수 조건으로 조회하지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | 제거 제안 | 이 행을 구분하는 고유 식별자입니다. |
| `candidateId` — String · FK → `Candidate.id` | 제거 제안 | 이 기록이 연결된 검토 후보의 ID입니다. |
| `verdict` — FitVerdict | 제거 제안 | 적합·부적합·판단 보류 중 평가 결과입니다. |
| `reason` — String? | 제거 제안 | 해당 판단 또는 평가를 내린 이유입니다. |
| `interventionNote` — String? | 제거 제안 | 사람이 남긴 협업 개입 방향에 관한 메모입니다. |
| `basedOnAssessmentId` — String? · FK → `FitAssessment.id` | 제거 제안 | 사람이 판단할 때 참고한 기존 AI 평가의 ID입니다. |
| `decidedById` — String · FK → `Member.id` | 제거 제안 | 판단을 기록한 내부 사용자의 ID입니다. |
| `createdAt` — DateTime | 제거 제안 | 이 기록이 처음 저장된 시각입니다. |

**처리 방식·제약:** 새 판단은 CandidateReviewDecision에 저장합니다. 기존 fit=fit을 연락처까지 확인한 승인으로 자동 변환하지 않습니다.

## 6. FitAssessment

물리 테이블: `fit_assessments`

과거 기록 보존 대상입니다. 새 업무 모델에서는 생성하거나 필수 조건으로 조회하지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | 제거 제안 | 이 행을 구분하는 고유 식별자입니다. |
| `candidateId` — String · FK → `Candidate.id` | 제거 제안 | 이 기록이 연결된 검토 후보의 ID입니다. |
| `researchId` — String · FK → `CompanyResearch.id` | 제거 제안 | 이 결과나 판단이 근거로 삼는 조사 버전의 ID입니다. |
| `verdict` — FitVerdict | 제거 제안 | 적합·부적합·판단 보류 중 평가 결과입니다. |
| `summary` — String | 제거 제안 | AI가 fit 평가의 결론과 이유를 요약한 내용입니다. |
| `informationGaps` — String[] | 제거 제안 | AI 평가에서 부족하다고 본 정보 목록입니다. |
| `criteriaVersion` — String | 제거 제안 | 평가에 사용한 판단 기준의 버전입니다. |
| `modelVersion` — String? | 제거 제안 | 평가에 사용한 AI 모델의 버전입니다. |
| `createdAt` — DateTime | 제거 제안 | 이 기록이 처음 저장된 시각입니다. |

**처리 방식·제약:** 기존 행은 이관 보존합니다. 최종 구조의 활성 테이블 유지와 과거 데이터 보존을 구분하며 이 문서가 즉시 DROP을 지시하지 않습니다.

## 7. InterventionAssessment

물리 테이블: `intervention_assessments`

과거 기록 보존 대상입니다. 새 업무 모델에서는 생성하거나 필수 조건으로 조회하지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | 제거 제안 | 이 행을 구분하는 고유 식별자입니다. |
| `assessmentId` — String · FK → `FitAssessment.id` | 제거 제안 | 이 영역별 평가가 속한 전체 AI fit 평가의 ID입니다. |
| `area` — String | 제거 제안 | 협업 가능성을 평가한 사업·분석 영역입니다. |
| `possibilityVerdict` — CriterionVerdict | 제거 제안 | 해당 영역에서 프로젝트 수행이 가능한지에 대한 AI 평가입니다. |
| `possibilityReason` — String | 제거 제안 | 수행 가능성 평가의 이유입니다. |
| `possibilityEvidenceIds` — String[] | 제거 제안 | 수행 가능성 평가를 뒷받침하는 근거 ID 목록입니다. |
| `prerequisites` — String[] | 제거 제안 | 프로젝트 수행에 앞서 충족되어야 한다고 본 조건 목록입니다. |
| `valueVerdict` — CriterionVerdict | 제거 제안 | 해당 프로젝트의 사업적 가치에 대한 AI 평가입니다. |
| `valueReason` — String | 제거 제안 | 사업적 가치 평가의 이유입니다. |
| `valueEvidenceIds` — String[] | 제거 제안 | 사업적 가치 평가를 뒷받침하는 근거 ID 목록입니다. |
| `targetBusinessOutcome` — String | 제거 제안 | 프로젝트로 달성하려는 사업적 성과입니다. |

**처리 방식·제약:** 기존 행은 이관 보존합니다. 최종 구조의 활성 테이블 유지와 과거 데이터 보존을 구분하며 이 문서가 즉시 DROP을 지시하지 않습니다.

## 8. Contact

물리 테이블: `contacts`

사람이 직접 찾고 저장한 관계자 이름·직함·선택 설명입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `companyId` — String · FK → `Company.id` | `companyId` — String · FK → `Company.id` · 유지 | 이 기록이 속한 기업의 ID입니다. |
| `name` — String | `name` — String · 유지 | 관계자의 이름입니다. |
| `title` — String? | `title` — String? · 유지 | 관계자의 직함입니다. |
| `role` — String? | `role` — String? · 유지 | 관계자가 맡는 역할을 설명한 값입니다. |
| `department` — String? | `department` — String? · 유지 | 관계자가 속한 부서입니다. |
| `jobFunction` — JobFunction | 제거 제안 | 자동 역할·직급·재직 평가 필드는 이번 수동 관계자 조사 모델에서 제거 제안합니다. |
| `seniority` — Seniority | 제거 제안 | 자동 역할·직급·재직 평가 필드는 이번 수동 관계자 조사 모델에서 제거 제안합니다. |
| `employmentStatus` — EmploymentStatus | 제거 제안 | 자동 역할·직급·재직 평가 필드는 이번 수동 관계자 조사 모델에서 제거 제안합니다. |
| `employmentCheckedAt` — DateTime? | 제거 제안 | 자동 역할·직급·재직 평가 필드는 이번 수동 관계자 조사 모델에서 제거 제안합니다. |
| `evidenceIds` — String[] | `evidenceIds` — String[] · 유지 | 이 정보를 뒷받침하는 근거 기록들의 ID 목록입니다. |
| `linkedinUrl` — String? | ContactEndpoint로 통합 | LinkedIn 주소를 두 곳에 중복 저장하지 않습니다. 기존 값은 endpoint로 이관합니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |

**처리 방식·제약:** AI 평가 통과 조건 없음. 이름 필수, 직함·역할·부서·근거는 선택. 같은 회사의 명확히 일치한 관계자만 재사용합니다.

## 9. ContactEndpoint

물리 테이블: `contact_endpoints`

사람이 찾은 관계자의 LinkedIn 프로필 또는 이메일 주소입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `companyId` — String · FK → `Company.id` | `companyId` — String · FK → `Company.id` · 유지 | 이 기록이 속한 기업의 ID입니다. |
| `contactId` — String? · FK → `Contact.id` | `contactId` — String · FK → `Contact.id` | 사람이 확인한 관계자입니다. 신규 개인 연락 경로는 필수이며 과거 공용 주소는 별도 이관 보존합니다. |
| `ownerType` — ChannelOwnerType | 제거 제안 | 자동 확보·검증 등급을 제거합니다. 저장은 형식·소속 검사이며 실제 전달 가능성을 자동 보증하지 않습니다. |
| `channel` — Channel | `channel` — Channel · 유지 | 이메일·LinkedIn 등 연락에 사용하는 채널입니다. |
| `address` — String | `address` — String · 유지 | 이메일 주소 또는 LinkedIn 프로필 URL 등 실제 연락 경로입니다. |
| `discoveryMethod` — DiscoveryMethod | 제거 제안 | 자동 확보·검증 등급을 제거합니다. 저장은 형식·소속 검사이며 실제 전달 가능성을 자동 보증하지 않습니다. |
| `ownershipStatus` — OwnershipStatus | 제거 제안 | 자동 확보·검증 등급을 제거합니다. 저장은 형식·소속 검사이며 실제 전달 가능성을 자동 보증하지 않습니다. |
| `validationStatus` — ValidationStatus | 제거 제안 | 자동 확보·검증 등급을 제거합니다. 저장은 형식·소속 검사이며 실제 전달 가능성을 자동 보증하지 않습니다. |
| `reachabilityStatus` — ReachabilityStatus | 제거 제안 | 자동 확보·검증 등급을 제거합니다. 저장은 형식·소속 검사이며 실제 전달 가능성을 자동 보증하지 않습니다. |
| `linkedinMethods` — LinkedinMethod[] | 제거 제안 | 자동 확보·검증 등급을 제거합니다. 저장은 형식·소속 검사이며 실제 전달 가능성을 자동 보증하지 않습니다. |
| `evidenceIds` — String[] | `evidenceIds` — String[] · 유지 | 이 정보를 뒷받침하는 근거 기록들의 ID 목록입니다. |
| `checkedAt` — DateTime? | `checkedAt` — DateTime? · 유지 | 연락 경로나 평가를 확인한 시각입니다. |
| `valid` — Boolean | 제거 제안 | 자동 확보·검증 등급을 제거합니다. 저장은 형식·소속 검사이며 실제 전달 가능성을 자동 보증하지 않습니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |
| 없음 | `recordedById` — String · FK → `Member.id` · 추가 | 이 연락 경로를 찾아 저장한 내부 사용자입니다. |

**처리 방식·제약:** UQ(companyId,channel,address) 유지. contact.companyId 일치 검사. checkedAt은 사람의 확인 시각이며 크롤러 검증 결과가 아닙니다. 검색 링크 클릭만으로 저장하지 않습니다.

## 10. ContactOptionAssessment

물리 테이블: `contact_option_assessments`

과거 기록 보존 대상입니다. 새 업무 모델에서는 생성하거나 필수 조건으로 조회하지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | 제거 제안 | 이 행을 구분하는 고유 식별자입니다. |
| `candidateId` — String · FK → `Candidate.id` | 제거 제안 | 이 기록이 연결된 검토 후보의 ID입니다. |
| `endpointId` — String · FK → `ContactEndpoint.id` | 제거 제안 | 사용 가능 여부를 평가하는 연락 경로의 ID입니다. |
| `status` — CandidateContactStatus | 제거 제안 | 이 후보에서 연락 경로를 사용 가능·확인 필요·사용 불가로 평가한 값입니다. |
| `roleRelevance` — String? | 제거 제안 | 관계자의 역할이 협업 제안과 얼마나 관련 있는지 설명합니다. |
| `decisionAuthority` — DecisionAuthority | 제거 제안 | 관계자의 의사결정 권한에 대한 평가입니다. |
| `reason` — String? | 제거 제안 | 해당 판단 또는 평가를 내린 이유입니다. |
| `sourceUrl` — String? | 제거 제안 | 해당 정보를 확인한 출처 URL입니다. |
| `confirmedById` — String? · FK → `Member.id` | 제거 제안 | 연락 경로를 직접 확인한 내부 사용자의 ID입니다. |
| `checkedAt` — DateTime | 제거 제안 | 연락 경로나 평가를 확인한 시각입니다. |

**처리 방식·제약:** 기존 행은 이관 보존합니다. 최종 구조의 활성 테이블 유지와 과거 데이터 보존을 구분하며 이 문서가 즉시 DROP을 지시하지 않습니다.

## 11. Outreach

물리 테이블: `outreaches`

사람이 보내기로 결정한 뒤 메시지를 준비하고 전송 사실을 기록하는 업무입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `companyId` — String · UQ · FK → `Company.id` | `companyId` — String · UQ · FK → `Company.id` · 유지 | 이 기록이 속한 기업의 ID입니다. 기업당 메시지 업무는 한 건만 둡니다. |
| `ownerId` — String · FK → `Member.id` | `ownerId` — String · FK → `Member.id` · 유지 | 이 연락 업무를 맡은 내부 사용자의 ID입니다. |
| `currentTargetQuarterId` — String · FK → `TargetQuarter.id` | `currentTargetQuarterId` — String · FK → `TargetQuarter.id` · 유지 | 현재 제안할 프로젝트의 목표 분기이며 메시지 준비 때 선택합니다. |
| `route` — Route | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `workStage` — WorkStage | `sendStatus` — enum(before_send/sent) | 발송 전·발송 완료만 구분합니다. 생성 진행·오류는 Job에서 관리합니다. |
| `internalDecision` — InternalDecision | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `version` — Int | `version` — Int · 유지 | 연락 업무의 동시 수정 충돌을 감지하기 위한 변경 번호입니다. |
| `recipientContactId` — String? · FK → `Contact.id` | `recipientContactId` — String? · FK → `Contact.id` · 유지 | 메시지를 받을 관계자의 ID입니다. |
| `recipientEndpointId` — String? · FK → `ContactEndpoint.id` | `recipientEndpointId` — String? · FK → `ContactEndpoint.id` · 유지 | 메시지를 보낼 연락 경로의 ID입니다. |
| `lastSentQuarterId` — String? · FK → `TargetQuarter.id` | SentMessage에서 조회 | 마지막 발송에서 제안한 **프로젝트 목표 분기**는 발송 기록에서 조회합니다. 실제 발송 달력 분기는 `SentMessage.sentAt`으로 집계합니다. |
| `reviewNote` — String? | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `conditionEvidence` — String? | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `reviewedAt` — DateTime? | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `decidedById` — String? · FK → `Member.id` | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `decidedAt` — DateTime? | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `skipNote` — String? | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `skipQuarterId` — String? · FK → `TargetQuarter.id` | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `currentRevision` — Int? | `currentRevision` — Int? · 유지 | 현재 사용 중인 메시지 초안 revision 번호입니다. |
| `approvedRevision` — Int? | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `originSearchRunId` — String? · FK → `SearchRun.id` | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `selectedChannel` — Channel? | `selectedChannel` — Channel? · 유지 | 사람이 선택한 전송 채널입니다. |
| `selectionVersion` — Int | 제거 제안 | 사람 검토는 CandidateReviewDecision으로 통합합니다. 별도 초안 승인·수집 배치 상속·분기별 skip 절차는 두지 않습니다. |
| `currentDraftRevision` — Int? | `currentRevision`으로 통합 | 중복된 현재 초안 포인터를 하나로 정리합니다. 이관 시 실제 사용처와 값 차이를 확인합니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |
| `updatedAt` — DateTime | `updatedAt` — DateTime · 유지 | 이 기록이 마지막으로 수정된 시각입니다. |
| 없음 | `candidateId` — String? · FK → `Candidate.id` · 추가 | 새 수집 후보에서 시작한 업무는 후보 ID를 기록합니다. 과거 프로젝트 기업에서 직접 시작한 첫 업무는 null입니다. |
| 없음 | `contactPurpose` — String? · 추가 | 기존 기업에 다시 연락하는 이유를 사람이 입력합니다. 기존 기업 직접 시작 시 필수이며 AI 생성 근거로 사용합니다. |

**처리 방식·제약:** 분기를 선택한 메시지 준비 시 생성. currentTargetQuarterId 필수 유지. 새 후보 경로는 승인·조사·수신자를 이어받고, 과거 프로젝트 기업 경로는 `PastProject` 존재, 발송·Outreach 부재, 사람의 연락 목적·수신자 입력을 요구합니다. 기업당 Outreach 한 건, 이번 범위의 첫 발송 한 번입니다. 기존 미발송 업무는 이어서 준비하고 이미 발송한 업무는 조회만 허용합니다. 메시지 입력 변경은 version으로 검사합니다.

## 12. MessageDraftRevision

물리 테이블: `message_draft_revisions`

저장 조사와 사람이 입력한 수신자·분기로 생성한 초안, 사람이 수정한 버전입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `outreachId` — String · FK → `Outreach.id` | `outreachId` — String · FK → `Outreach.id` · 유지 | 이 초안 또는 발송 기록이 속한 연락 업무의 ID입니다. |
| `revision` — Int | `revision` — Int · 유지 | 같은 연락 업무 안에서 초안 내용의 버전을 구분하는 번호입니다. |
| `topic` — String | `topic` — String · 유지 | 협업 제안의 주제입니다. |
| `subject` — String | `subject` — String · 유지 | 메시지 제목입니다. |
| `body` — String | `body` — String · 유지 | 메시지 본문입니다. |
| `templateId` — String? · FK → `Template.id` | `templateId` — String? · FK → `Template.id` · 유지 | 메시지 작성에 사용한 템플릿의 ID입니다. |
| `templateVersion` — Int? | `templateVersion` — Int? · 유지 | 메시지 작성에 사용한 템플릿의 버전입니다. |
| `createdBy` — DraftOrigin | `createdBy` — DraftOrigin · 유지 | 초안이 AI 생성인지 사람 수정인지 등 생성 경로를 나타냅니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |
| 없음 | `generationResearchId` — String? · FK → `CompanyResearch.id` · **추가** | 이 초안을 생성할 때 사용한 조사 버전의 ID입니다. |
| 없음 | `generationReviewDecisionId` — String? · FK → `CandidateReviewDecision.id` · **추가** | 이 초안 생성의 근거가 된 사람 승인 기록의 ID입니다. |
| 없음 | `recipientContactId` — String? · FK → `Contact.id` · **추가** | 초안 생성 당시 선택된 수신자의 ID입니다. |
| 없음 | `recipientEndpointId` — String? · FK → `ContactEndpoint.id` · **추가** | 초안 생성 당시 선택된 연락 경로의 ID입니다. |
| 없음 | `recipientSnapshot` — Json? · **추가** | 초안 생성 당시의 수신자 이름·직함·연락 경로를 고정해 보관합니다. |
| 없음 | `targetQuarterId` — String? · FK → `TargetQuarter.id` · **추가** | 초안 생성 당시 제안한 목표 분기의 ID입니다. |
| 없음 | `contactPurposeSnapshot` — String? · **추가** | 기존 기업의 메시지를 생성·수정할 때 사용한 사람 입력 목적을 당시 문장 그대로 보존합니다. |
| 없음 | `historySourceIds` — Json? · **추가** | 과거 프로젝트 기업의 첫 메시지에 사용한 `PastProject` ID를 보존합니다. 기존 데이터의 다른 이력 유형은 그대로 둡니다. |

**처리 방식·제약:** 새 후보 초안은 조사·사람 판단을, 기존 기업 초안은 과거 이력 ID·사람 연락 목적을 근거로 요구합니다. 공통으로 수신자·분기가 필요합니다. UQ(outreachId,revision). 웹 검색 없음. 별도 승인 revision 없음. 생성 중 입력 변경은 저장 시 거절합니다.

## 13. SentMessage

물리 테이블: `sent_messages`

발송 당시 내용·수신자·제안한 프로젝트 목표 분기를 보존합니다. 실제 발송 달력 분기는 `sentAt`을 한국 시간으로 변환해 구합니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 이 행을 구분하는 고유 식별자입니다. |
| `outreachId` — String · FK → `Outreach.id` | `outreachId` — String · FK → `Outreach.id` · 유지 | 이 초안 또는 발송 기록이 속한 연락 업무의 ID입니다. |
| `targetQuarterId` — String · FK → `TargetQuarter.id` | `targetQuarterId` — String · FK → `TargetQuarter.id` · 유지 | 발송 당시 제안한 목표 분기의 ID이며 이후 분기 변경과 무관하게 보존합니다. |
| `channel` — Channel | `channel` — Channel · 유지 | 이메일·LinkedIn 등 연락에 사용하는 채널입니다. |
| `recipientContactId` — String · FK → `Contact.id` | `recipientContactId` — String · FK → `Contact.id` · 유지 | 메시지를 받을 관계자의 ID입니다. |
| `recipientEndpointId` — String · FK → `ContactEndpoint.id` | `recipientEndpointId` — String · FK → `ContactEndpoint.id` · 유지 | 메시지를 보낼 연락 경로의 ID입니다. |
| `recipientNameSnapshot` — String | `recipientNameSnapshot` — String · 유지 | 발송 당시 수신자 이름을 고정해 보관합니다. |
| `addressSnapshot` — String | `addressSnapshot` — String · 유지 | 발송 당시 실제 연락 주소를 고정해 보관합니다. |
| `subjectSnapshot` — String | `subjectSnapshot` — String · 유지 | 발송 당시 메시지 제목을 고정해 보관합니다. |
| `bodySnapshot` — String | `bodySnapshot` — String · 유지 | 발송 당시 메시지 본문을 고정해 보관합니다. |
| `templateId` — String? · FK → `Template.id` | `templateId` — String? · FK → `Template.id` · 유지 | 메시지 작성에 사용한 템플릿의 ID입니다. |
| `templateVersion` — Int? | `templateVersion` — Int? · 유지 | 메시지 작성에 사용한 템플릿의 버전입니다. |
| `status` — SendStatus | `status` — SendStatus · 유지 | 메시지 발송 기록의 상태이며 수주 성공 여부가 아닙니다. |
| `sentAt` — DateTime | `sentAt` — DateTime · 유지 | 실제 발송 완료로 기록한 시각입니다. 발송 달력 분기 집계의 기준입니다. |
| `createdAt` — DateTime | `createdAt` — DateTime · 유지 | 이 기록이 처음 저장된 시각입니다. |
| 없음 | `draftRevision` — Int? · **추가** | 발송에 사용한 초안 버전이며 동일 완료 기록의 중복을 막는 데 사용합니다. |
| 없음 | `recordedById` — String? · FK → `Member.id` · 추가 | 외부 채널 전송 완료를 기록한 사용자입니다. 신규 기록 필수, 과거 기록은 추정하지 않습니다. |

**처리 방식·제약:** UQ(outreachId,draftRevision) 추가. 신규 발송 기록은 revision 필수. 기존 발송은 null 유지하며 추측해 채우지 않습니다.

## 14. CollectionSource

물리 테이블: `collection_sources`

어떤 웹 아카이브나 메일함에서 수집하는지 설정합니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK(cuid) · **추가** | 이 행을 구분하는 고유 식별자입니다. |
| 없음 | `kind` — enum(web_archive/gmail) · **추가** | 웹 아카이브·Gmail 등 수집원 종류입니다. |
| 없음 | `key` — String · UQ · **추가** | 수집원을 고유하게 구분하는 문자열 키입니다. |
| 없음 | `name` — String · **추가** | 수집원을 화면에 표시할 이름입니다. |
| 없음 | `enabled` — Boolean · **추가** | 이 수집원 자체를 자동 수집 대상으로 사용할지 나타냅니다. 전체 유입 일시정지와는 별개입니다. |
| 없음 | `config` — Json · **추가** | 수집 URL·추출 설정 등 소스별 설정이며 인증 비밀은 포함하지 않습니다. |
| 없음 | `parserVersion` — String · **추가** | 원문에서 기업을 추출할 때 사용하는 처리 규칙의 버전입니다. |

**처리 방식·제약:** 신규 테이블. 현재 web_archive만 구현. 인증 비밀은 config에 넣지 않습니다.

## 15. CollectionItem

물리 테이블: `collection_items`

웹 아카이브 글 하나 또는 향후 이메일 한 통의 처리 기록입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK(cuid) · **추가** | 이 행을 구분하는 고유 식별자입니다. |
| 없음 | `sourceId` — String · FK → `CollectionSource.id` · **추가** | 이 실행·원문·이름 키가 속한 수집원의 ID입니다. |
| 없음 | `firstRunId` — String · FK → `SearchRun.id` · **추가** | 이 원문을 최초로 수집한 실행의 ID입니다. |
| 없음 | `externalKey` — String · **추가** | 원문 URL·제공자 ID 등 같은 원문을 식별하는 고정 키입니다. |
| 없음 | `url` — String? · **추가** | 수집 원문을 확인할 수 있는 URL입니다. |
| 없음 | `title` — String? · **추가** | 수집 원문의 제목입니다. |
| 없음 | `publishedAt` — DateTime? · **추가** | 원문이 게시된 시각입니다. |
| 없음 | `contentHash` — String? · **추가** | 원문 내용의 변경 여부를 감지하기 위한 해시 값입니다. |
| 없음 | `parserVersion` — String · **추가** | 원문에서 기업을 추출할 때 사용하는 처리 규칙의 버전입니다. |
| 없음 | `status` — enum(pending/processing/completed/failed) · **추가** | 원문 하나의 추출 처리가 대기·처리 중·완료·실패 중 어디에 있는지 나타냅니다. |
| 없음 | `attempt` — Int · **추가** | 해당 작업 또는 원문 처리를 시도한 회차입니다. |
| 없음 | `leaseToken` — String? · **추가** | 현재 처리 권한을 가진 worker를 식별해 오래된 작업의 덮어쓰기를 막습니다. |
| 없음 | `leaseUntil` — DateTime? · **추가** | worker가 가진 임시 처리 권한이 만료되는 시각입니다. |
| 없음 | `errorCode` — String? · **추가** | 실패 원인을 프로그램에서 구분하기 위한 오류 코드입니다. |
| 없음 | `errorMessage` — String? · **추가** | 실패 원인을 설명하는 메시지입니다. |
| 없음 | `retryable` — Boolean? · **추가** | 실패한 원문 처리를 재시도할 수 있는지 나타냅니다. |
| 없음 | `extractedAt` — DateTime? · **추가** | 원문에서 기업명과 설명을 추출한 시각입니다. |

**처리 방식·제약:** firstRunId는 `FK → SearchRun.id`. UQ(sourceId,externalKey). 완료 원문은 다시 추출하지 않습니다. 실패 원문만 재시도.

## 16. CollectedCompany

물리 테이블: `collected_companies`

원문에서 추출한 기업명·설명과 그 처리 결과입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK(cuid) · **추가** | 이 행을 구분하는 고유 식별자입니다. |
| 없음 | `itemId` — String · FK → `CollectionItem.id` · **추가** | 이 기업명·설명을 추출한 수집 원문의 ID입니다. |
| 없음 | `name` — String · **추가** | 원문에서 추출한 기업의 이름입니다. |
| 없음 | `normalizedName` — String · **추가** | 중복 비교를 위해 공백·문자 표기를 정리한 기업명입니다. |
| 없음 | `summary` — String · **추가** | 수집 원문에서 추출한 기업의 한 줄 설명입니다. |
| 없음 | `companyId` — String? · FK → `Company.id` · **추가** | 이 기록이 속한 기업의 ID입니다. |
| 없음 | `candidateId` — String? · FK → `Candidate.id` · **추가** | 이 기록이 연결된 검토 후보의 ID입니다. |
| 없음 | `result` — enum(created/duplicate/error) · **추가** | 추출한 기업이 신규 생성·중복·처리 오류 중 무엇에 해당하는지 나타냅니다. |
| 없음 | `errorCode` — String? · **추가** | 실패 원인을 프로그램에서 구분하기 위한 오류 코드입니다. |

**처리 방식·제약:** UQ(itemId,normalizedName). 중복 추출을 새 검토 후보로 만들거나 기존 조사 정보를 덮어쓰지 않습니다.

## 17. CompanyNameKey

물리 테이블: `company_name_keys`

소스별 정규화 기업명과 기존 기업을 연결하는 중복 방지 키입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK(cuid) · **추가** | 이 행을 구분하는 고유 식별자입니다. |
| 없음 | `sourceId` — String · FK → `CollectionSource.id` · **추가** | 이 실행·원문·이름 키가 속한 수집원의 ID입니다. |
| 없음 | `normalizedName` — String · **추가** | 중복 비교를 위해 공백·문자 표기를 정리한 기업명입니다. |
| 없음 | `companyId` — String · FK → `Company.id` · **추가** | 이 기록이 속한 기업의 ID입니다. |
| 없음 | `createdAt` — DateTime · **추가** | 이 기록이 처음 저장된 시각입니다. |

**처리 방식·제약:** UQ(sourceId,normalizedName), index(companyId). 동명 충돌은 자동 병합하지 않습니다.

## 18. CandidateReviewDecision

물리 테이블: `candidate_review_decisions`

사람의 승인·이유별 거절·재검토 이력입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK(cuid) · **추가** | 이 행을 구분하는 고유 식별자입니다. |
| 없음 | `candidateId` — String · FK → `Candidate.id` · **추가** | 이 기록이 연결된 검토 후보의 ID입니다. |
| 없음 | `action` — enum(approve/reject_fit/reject_contact/reopen) · **추가** | 사람이 승인·fit 거절·연락처 거절·재검토 중 어떤 행동을 했는지 기록합니다. |
| 없음 | `fit` — enum(fit/unfit)? · **추가** | 사람이 내린 적합성 판단이며 연락처 확보 여부와 구분합니다. |
| 없음 | `contactResult` — enum(confirmed/not_found/unchecked) · **추가** | 연락 경로를 확인했는지·못 찾았는지·아직 확인 전인지 나타냅니다. |
| 없음 | `researchId` — String · FK → `CompanyResearch.id` · **추가** | 이 결과나 판단이 근거로 삼는 조사 버전의 ID입니다. |
| 없음 | `contactId` — String? · FK → `Contact.id` · **추가** | 연결된 관계자의 ID입니다. |
| 없음 | `endpointId` — String? · FK → `ContactEndpoint.id` · **추가** | 사용 가능 여부를 평가하는 연락 경로의 ID입니다. |
| 없음 | `note` — String? · **추가** | 해당 검토 결정에 사람이 덧붙인 메모입니다. |
| 없음 | `decidedById` — String · FK → `Member.id` · **추가** | 판단을 기록한 내부 사용자의 ID입니다. |
| 없음 | `createdAt` — DateTime · **추가** | 이 기록이 처음 저장된 시각입니다. |

**처리 방식·제약:** append-only. 판단 당시 조사·관계자 참조를 보존합니다.

## 19. ResearchClaim

물리 테이블: `research_claims`

AI 조사 결과의 개별 진술입니다. 한 행은 하나의 분류와 사실·추론 구분을 갖습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 조사 항목의 고유 ID입니다. |
| `researchId` — String · FK → `CompanyResearch.id` | `researchId` — String · FK → `CompanyResearch.id` · 유지 | 이 항목이 속한 조사 버전입니다. |
| `category` — ClaimCategory | `category` — ClaimCategory · 유지 | 제품·고객·수익 모델 등 조사 내용의 분류입니다. |
| `content` — String | `content` — String · 유지 | 사람이 검토할 구체적인 조사 내용입니다. |
| `basis` — ClaimBasis | `basis` — ClaimBasis · 유지 | 출처에서 확인한 사실인지 자료로부터의 추론인지 구분합니다. |
| `evidenceIds` — String[] | `evidenceIds` — String[] · 유지 제안 | 근거 Evidence ID 목록입니다. 현재 배열 원소에는 DB 외래키가 없습니다. |

**처리 방식·제약:** 새로운 평가 점수나 fit 결론을 추가하지 않습니다. `reported_fact`에는 근거가 최소 하나 필요하다는 기존 앱 규칙을 유지하고, 참조한 Evidence의 존재와 회사 일치는 저장·조회 시 검증해야 합니다. 배열을 실제 연결 테이블로 전환할지는 별도 구현 선택입니다.

## 20. Evidence

물리 테이블: `evidence`

수집 또는 조사에 사용한 출처 기록입니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| `id` — String · PK | `id` — String · PK · 유지 | 출처 기록의 고유 ID입니다. |
| `companyId` — String · FK → `Company.id` | `companyId` — String · FK → `Company.id` · 유지 | 출처가 연결된 기업입니다. |
| `searchRunId` — String? · FK → `SearchRun.id` | `searchRunId` — String? · FK → `SearchRun.id` · 유지 | 수집 실행과 직접 연결될 때만 기록합니다. 독립 조사 근거에는 필수가 아닙니다. |
| `url` — String | `url` — String · 유지 | 근거 원문의 URL입니다. |
| `sourceKey` — String | `sourceKey` — String · 유지 | 출처 종류나 제공자를 식별하는 키입니다. |
| `title` — String? | `title` — String? · 유지 | 출처의 제목입니다. |
| `excerpt` — String? | `excerpt` — String? · 유지 | 판단에 참고할 원문 발췌입니다. |
| `publishedAt` — DateTime? | `publishedAt` — DateTime? · 유지 | 원문 게시 시각입니다. |
| `retrievedAt` — DateTime | `retrievedAt` — DateTime · 유지 | 출처를 확인한 시각입니다. |

**처리 방식·제약:** 같은 URL도 수집 시각과 발췌가 다르면 별도 기록으로 남길 수 있습니다. `ResearchClaim.evidenceIds`와 연결할 때 같은 기업의 근거인지 검사합니다.

## 21. ReviewAssignmentBatch

물리 테이블 제안: `review_assignment_batches`

팀장이 현재 배정 가능 큐에서 고른 기업을 특정 작업 기간의 한 회차로 확정한 기록입니다. 프로젝트 목표 분기나 SearchRun과 관계없습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK · **추가** | 배정 회차의 고유 ID입니다. |
| 없음 | `workStartsOn` — Date · **추가** | 팀장이 정한 리스트업·첫 발송 작업 기간의 시작 날짜입니다. |
| 없음 | `workEndsOn` — Date · **추가** | 작업 기간의 마지막 날짜입니다. 종료 시 미완료 기업을 자동 거절하거나 재배정하지 않습니다. |
| 없음 | `snapshotAt` — DateTime · **추가** | 대상 ID를 확정한 시각입니다. 이후 들어온 기업은 이 회차에 들어오지 않습니다. |
| 없음 | `eligibleCountAtSnapshot` — Int · **추가** | 확정 당시 배정 가능했던 전체 기업 수입니다. |
| 없음 | `perMemberCount` — Int · **추가** | 이번 회차에서 선택한 팀원 한 명당 배정 수입니다. |
| 없음 | `selectedMemberCount` — Int · **추가** | 배정에 참여한 팀원 수입니다. |
| 없음 | `createdById` — String · FK → `Member.id` · **추가** | 회차를 확정한 팀장입니다. |
| 없음 | `createdAt` — DateTime · **추가** | 회차 저장 시각입니다. |

**처리 방식·제약:** workStartsOn ≤ workEndsOn, perMemberCount > 0, selectedMemberCount > 0. 이번 회차의 총 배정 수는 두 수의 곱이며, 실제 선택한 기업 ID는 ReviewAssignmentItem에 고정합니다. 날짜는 운영 계획이며 날짜만으로 수정 권한이나 상태가 자동 변경되지는 않습니다.

## 22. ReviewAssignmentItem

물리 테이블 제안: `review_assignment_items`

회차에서 확정한 기업과 담당자의 대응입니다. 빠르게 처리한 팀원에게 자동으로 새 기업을 보충하지 않습니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK · **추가** | 배정 항목의 고유 ID입니다. |
| 없음 | `batchId` — String · FK → `ReviewAssignmentBatch.id` · **추가** | 이 기업을 고른 배정 회차입니다. |
| 없음 | `candidateId` — String · FK → `Candidate.id` · UQ · **추가** | 배정한 후보입니다. 한 후보를 두 회차에 중복 배정하지 않습니다. |
| 없음 | `memberId` — String · FK → `Member.id` · **추가** | 확정 당시 담당 팀원입니다. |
| 없음 | `assignedAt` — DateTime · **추가** | 배정이 확정된 시각입니다. |

**처리 방식·제약:** 확정 시 각 팀원에게 정확히 perMemberCount건을 배정하고 Candidate.reviewOwnerId를 같은 트랜잭션에서 설정합니다. 이 행은 최초 배정의 근거로 보존합니다. 재배정은 자동으로 하지 않으며, 필요해지면 현재 담당자 변경과 변경 이력을 별도 계약으로 정의합니다.

## 23. CollectionIntakeControl

물리 테이블 제안: `collection_intake_controls`

팀장이 새로운 수집 실행을 일시정지하거나 재개할 때 쓰는 전체 유입 스위치입니다. 배정 회차의 고정은 이 스위치와 무관하게 유지됩니다.

| AS-IS | TO-BE | 설명 |
|---|---|---|
| 없음 | `id` — String · PK · **추가** | 대협 수집 유입 설정의 단일 행 ID입니다. |
| 없음 | `paused` — Boolean · **추가** | true면 이후 예정된 수집 실행을 시작하지 않습니다. |
| 없음 | `version` — Int · **추가** | 동시 설정 변경을 감지하는 번호입니다. |
| 없음 | `changedById` — String? · FK → `Member.id` · **추가** | 가장 최근 일시정지 또는 재개를 수행한 팀장입니다. 최초 기본 상태에서는 null입니다. |
| 없음 | `changedAt` — DateTime · **추가** | 가장 최근 설정 변경 시각입니다. |

**처리 방식·제약:** CollectionSource.enabled는 개별 소스 활성화이고 이 테이블은 전체 유입 제어입니다. 일시정지는 새 수집 실행 시작만 막습니다. 이미 진행 중인 수집·조사와 확정된 배정은 그대로 진행하며, 재개 시 놓친 원문을 어떻게 따라잡을지는 수집원별 운영 정책으로 정합니다.

## 함께 확인한 재사용·범위 경계

| 테이블 | 검토 결과 |
|---|---|
| Company | 기업 식별·소개 유지. 법인명·도메인 필수화 없음. permanentlyExcluded/isPrelaunchOnly를 AI 판정으로 설정하지 않음. 과거 사람이 설정한 제외와 발송 이력은 별도 이관 검토. |
| TargetQuarter / OutreachTargetQuarterChange | 분기 마스터와 메시지 준비 중 분기 변경 기록 재사용. SearchRun 역참조 제거. |
| Template / PastProject | 메시지 틀·협업 사례 재사용. Template.route는 기존 템플릿 선택 호환용이며 후보 처리 단계가 아님. |
| Job / DhIdempotencyKey | 메시지 생성 실행·오류 및 사용자 요청 중복 방지 재사용. 승인·거절 상태와 분리. |
| Member | 수집 담당자 관계 제거, 검토·연락처 저장·발송 기록 사용자 역참조 추가. 기존 인증 역할 유지. |
| Response / PrelaunchContact | 이번 검색→검토→전송 경로에서 새 절차를 만들지 않음. 과거 응답·연락 이력 보존. |

ResearchIdea 신규 테이블 제안은 철회합니다. 메시지의 아이디어는 저장된 ResearchClaim/Evidence로 생성할 수 있으므로 별도 사전 생성·저장을 필수화하지 않습니다. 기존 공통 테이블의 다른 기능 사용처는 물리 제거 전에 확인합니다.

## 이관과 최종 구조의 구분

- 기존 데이터를 보존하려고 제거 대상 필드를 최종 TO-BE에 유지하지 않습니다. 이관 중 nullable/호환 필드가 잠시 남는 것은 별도 migration 단계입니다.
- 과거 실행의 분기·배정 정보, AI 평가, 연락처 평가, 사람 판단은 백업·보관 후 참조 이관을 검증합니다. 발송 스냅샷은 그대로 유지합니다.
- CompanyNameKey와 원문 처리 기록은 중복 실행 방지용입니다. 중복을 새 후보로 만들거나 기존 조사/판단을 덮어쓰지 않습니다.
- 물리 Prisma, DB 및 프론트 코드는 이번 검토에서 수정하지 않았습니다.

관련 문서: [변경 명세](human-review-db-api-change-spec.md), [API AS-IS YAML](human-review-api-as-is.yaml), [API TO-BE YAML](human-review-api-to-be.yaml).
