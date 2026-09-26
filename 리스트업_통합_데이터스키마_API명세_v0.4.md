# 리스트업–컨택 통합 명세 v0.4

> 작성일: 2026-09-26 · 상태: 확정 정책을 바탕으로 한 설계·인계 초안
>
> 대상 독자: 대외협력 팀원·기획자·프론트엔드 및 백엔드 개발자
>
> 이 문서는 실제 사용 맥락, 확정된 업무 정책, 데이터 구조, API 계약, 프론트 반영 사항을 함께 설명한다. API 요청·응답·쿼리의 필드명은 **camelCase**다. DB의 기존 snake_case 컬럼명은 별도로 유지할 수 있다.
>
> 미결 정책은 이번 버전의 계약에서 제외했다. 제외 범위는 §0.2에만 명시하며, 구현자가 임의의 기본 정책을 채워 넣지 않는다. 파일 작성만으로 백엔드·DB·프론트가 변경되거나 API 연동이 완료되는 것은 아니다.
>
> **목업 배포 상태: 완료 — 2026-09-26 15:08 KST 확인.** [배포된 목업](https://admin-dh-frontend.vercel.app/listup.html). 프론트 목업 배포와 실제 API·권한·검색·발송 연동 완료는 별개다. 상세 상태는 §0.3.
>
## 0. 문서 읽는 방법과 적용 범위

### 0.1 무엇이 확정이고 무엇이 구현 제안인가

| 표시 | 의미 | 구현 시 취급 |
| --- | --- | --- |
| **확정 정책** | 사용자와 합의한 업무 규칙. §3의 P 번호로 식별 | 화면·서버 모두 충족해야 함 |
| **구현 계약안** | 확정 정책을 구현하기 위해 제시한 필드·응답·경로·제약 | 구현 대상 계약. 실제 배포된 계약과 충돌하면 §8의 전환 절차를 적용 |
| **구현 고려 사항** | 저장·실행·성능·동시성 구현에서 검토할 방법 | 요구 결과를 유지하면서 구현 방법을 조정 가능 |
| **현행 확인** | 확인한 로컬 코드의 구조와 동작 | 제품 정책으로 승격하지 않음. 운영 배포 상태와 동일하다고 가정하지 않음 |

정책과 구현은 같은 확정 수준이 아니다. 예를 들어 ‘메시지 중복 발송을 막는다’는 정책이고, 메시지별 멱등 키와 유니크 제약은 이를 지키는 구현 계약안이다.

- 업무 이해: §1 목적 → §2 사용 시나리오 → §3 정책.
- 개발: §4 개념 → §5 스키마 → §6 API → §7 프론트 및 실행 고려 사항.
- 기존 구현 변경: §8 이관 → §9 변경표·검증.
- 선행 문서: [v0.1 탐색 명세](리스트업_데이터스키마_API명세_v0.1.md), [v0.2 워크플로우](리스트업_통합워크플로우_변경명세_v0.2.md), [v0.3 통합 명세](리스트업_통합_데이터스키마_명세_v0.3.md).
- 본문에서 새로 정의한 v0.4 계약은 선행 문서의 같은 항목보다 우선한다. §0.2의 제외 항목을 이전 문서에서 가져와 확정한 것으로 해석하지 않는다.

### 0.2 남은 논의 아젠다 — 결론 전 구현하지 않을 항목

다음 항목은 결론·기본값·허용 범위를 정하지 않는다. 의존하는 API 또는 동작도 확정하지 않는다.

| 제외 항목 | 이번 버전의 경계 |
| --- | --- |
| 조사 실행·종료 정책 — 팀원과 논의 | 목표 수량이 발견 수/조사 수/적합·연락 가능 확보 수 중 무엇인지, 목표 미달 시 언제 종료할지, 보완 루프·시간·비용 상한 및 기술 재시도 한도를 결정해야 함. 작업 상태·결과 형식만 포함하며 기본 숫자를 임의로 정하지 않음 |
| 기업 보기의 전체 선택 범위 | 배치 보기는 배치 단위로 확정. 기업 보기의 페이지→전체 결과 확장은 아직 검토안. 벌크 API는 명시적인 항목 배열을 받고 전역 전체 선택 플래그는 없음 |
| 소스 등록·관리 방식 및 수집기 연결 | 발견/보완 출처의 정책은 확정. 등록 주체·관리 화면·등록 API·수집기별 실행 계약은 미정. §7.3.1에 현행과 구현 제안을 구분 |

**조사 실행 아젠다의 논의 예:** 사용자가 20개를 요청했는데 20개를 조사한 결과 적합·연락 가능 기업이 6개라면 종료할지, 20개를 확보할 때까지 추가 발견을 시도할지 정해야 한다. 후자여도 출처 소진·시간·비용 한도와 부분 완료 결과가 필요하다. 시작한 조사 안에서의 보완 루프와, 종료 후 기업을 주기적으로 다시 보는 자동 재검토는 별개다. 후자의 자동 재검토는 하지 않기로 확정했다.

**이미 결정된 항목:** 시작한 팀원이 탐색부터 첫 전송까지 담당한다. 수동 연락처는 사람이 해당 기업의 연락 창구임을 확인해 등록하면 사용 가능하다. 추가 조사 요청만으로 후보를 제외하거나 기존 수신자·채널을 초기화하지 않는다. 기존 기업 재조사는 사람의 명시적 요청으로만 시작한다. 선택 소스는 기업 발견에 적용하고 후속 보완은 접근이 허용된 다른 출처를 사용할 수 있다.

**2026-09-26 추가 확정:** 배치 보기의 전체 선택은 해당 배치 안에서 한 번에 수행하고 별도의 페이지→배치 선택 확장 단계를 두지 않는다. 팀원은 본인 담당 업무만 수정·전송할 수 있고 타인 업무는 조회만 가능하다. 팀장은 모든 담당자의 업무를 수정·전송할 수 있다. 팀장 권한이 담당자 재배정 기능을 새로 포함한다는 뜻은 아니다.

**범위 밖으로 분리:** 전송 또는 협업 기록이 있는 기업은 별도 페이지에서 다룬다. 이번 범위는 신규 리스트업 기업의 첫 성공 전송까지이며, 재접촉·재수주·다른 담당자 추가 발송 정책과 해당 페이지는 별도 작업이다. 공통 템플릿 원문 관리·게시 권한, 발신 계정 관리 화면도 제외한다. 기존 템플릿 조회·사용 및 당시 버전 기록은 포함한다.

### 0.3 구현·배포 상태 — 2026-09-26 갱신

| 항목 | 확인된 상태 |
| --- | --- |
| 프론트 목업 | **Vercel 배포 완료**. 기존 주소 [listup.html](https://admin-dh-frontend.vercel.app/listup.html)에서 동작 확인 |
| 반영된 UI | 통합 후보 목록, 기업/배치 보기, 전체 높이 오른쪽 상세 패널, 배치 단위 즉시 전체 선택, 본인/팀장 변경·타인 조회 전용 |
| 검토용 샘플 | [가상 기업 48개 목업](https://admin-dh-frontend.vercel.app/listup.html?selectionPreview=1). 두 배치에 각각 24개, 메모리에서만 동작하며 기존 localStorage에 영향 없음 |
| 권한 검토 | 상단 ‘권한 미리보기’에서 샘플 팀원 A/B·팀장 전환 가능. 실제 로그인/역할 부여 기능이 아닌 시연용 UI |
| 배포 소스 | 브랜치 `codex/listup-v04-mockup`, 커밋 `4b2a326b3fe8c6b1d94b03c72edd65cbbb978169` |
| Vercel 이력 | [Production 배포](https://vercel.com/ghsnu/admin-dh-frontend/97MzDXmW9yvpi1CtjiMRSwv6bE9A), 상태 Ready. 검증한 Preview를 Production으로 승격 |
| Git 반영 범위 | 배포용 브랜치 push 완료. 기존 닫힌 PR을 재개하거나 새 PR을 생성하지 않았으며 main 병합도 하지 않음. 이후 main에서 자동 배포하면 그 브랜치의 코드로 바뀔 수 있음 |
| 검증 | 타입 검사, 프론트 빌드, 모델 테스트 8개 통과. 배치 24개 즉시 선택/다음 페이지 유지/확장 안내 없음, 팀원 타인 조회 전용·팀장 변경 UI를 브라우저에서 확인 |
| 미연동 | 실제 로그인 및 서버 권한 검증, 검색/LLM 조사, 소스 등록, 초안 생성 API, 실제 이메일 발송·외부 기록 저장은 이번 목업 배포에 포함되지 않음 |
| 남은 화면 반영 | 전송·협업 이력 별도 페이지 및 기존 ‘전송 완료’ 필터 정리, 기존 ‘재조사 필요’ 후보 제외 동작 제거 등은 §7.2에서 계속 추적 |

‘Production’은 기존 공유 주소에 연결된 Vercel 배포 환경 이름이다. 실데이터 운영 또는 이 문서 전체 구현 완료를 뜻하지 않는다. 백엔드와 DB는 이번 배포에서 변경하지 않았다.

## 1. 서비스의 목적과 사용 맥락

### 1.1 왜 만드는가

GrowthHackers SNU의 대외협력 팀원이 적합한 기업을 찾고 연락해, 개입 가능성과 개입 가치가 있는 프로젝트를 유치하도록 돕는다. 핵심 활동은 기업 조사·연락 대상 선택·메시지 작성 및 전송이며, 주요 운영 지표는 **해당 달력 분기에 발송 완료한 메시지 수**다.

시스템은 기업·관계자·공개 연락 창구를 조사하고 fit을 판단한다. 사람은 근거를 확인하고, LinkedIn 프로필 등을 직접 본 뒤 수신자와 채널을 선택한다. LinkedIn 활동성·답장 가능성을 AI가 확인했다고 표시하지 않는다.

### 1.2 사용자는 누구인가

- 로그인한 대외협력 팀원이 탐색 배치를 시작한다. 해당 팀원이 배치와 그 결과 기업을 첫 전송까지 담당한다. 보완 조사·분기 이동으로 담당자가 바뀌지 않는다.
- 배치 담당자는 실행의 책임자다. 배치의 AI 판단을 일괄 승인한 사람이 아니다.
- 팀원은 전체 업무를 조회할 수 있지만 본인 담당 업무만 변경한다. 팀장은 전체 업무를 변경할 수 있다. 분기 이동 후에도 원 담당자 기준이 유지된다. 미지정인 과거 업무는 임의로 소유권을 추정하지 않고 팀장만 변경한다.
- 팀장의 업무 배정·담당자 재배정 기능은 이번 범위에 포함하지 않는다.
- 단일 조직 내부 도구다. `workspaceId` 또는 별도의 TeamProfile을 요구하지 않는다. 로그인 사용자와 배치 담당자 정보는 필요하다.

### 1.3 화면의 기본 원칙

후보 목록은 하나다. **기업 보기 / 탐색 배치 보기**는 같은 기업 데이터를 다르게 묶어 보여준다. 배치를 펼치면 동일한 열 구조의 기업 테이블이 나타난다.

기업을 열면 같은 상세 영역에서 조사 근거 → 관계자·채널 선택 → 메시지 수정·확인 → 전송으로 이어진다. ‘컨택 작업에 추가’나 별도 ‘초안 검토 페이지’를 필수 단계로 두지 않는다. 이메일 발송 직전 최종 내용을 확인하는 동작은 이 화면 안의 확인 창 등으로 제공할 수 있다.

기본 보기는 내 담당 업무다. 기업 상세는 전체 화면 높이의 오른쪽 슬라이드 패널로 열고 목록 위치를 유지한다. 첫 전송 성공 후에는 신규 작업 대상으로 남기지 않고 기록을 보존한다. 전송·협업 이력이 있는 기업의 후속 작업은 별도 페이지로 분리한다. 실패한 최초 전송은 재접촉 이력으로 간주하지 않으며, 결과 불명은 성공/실패가 확인되기 전 재발송하지 않는다.

## 2. 실제 사용 시나리오

### 2.1 정상 흐름: 4분기를 준비하며 9월에 연락하기

| 단계 | 사용자가 하는 일 | 시스템이 저장·제공하는 것 | 화면에서 확인하는 것 |
| --- | --- | --- | --- |
| 1 | 2026년 4분기, 검색 소스, 관심 기업 조건을 선택해 탐색 시작 | 목표 분기에 연결된 배치, 로그인한 담당자, 당시 입력 스냅샷 | 배치의 접수·진행 상태 |
| 2 | 조사 진행을 기다리거나 다른 기업 작업 | 식별된 기업, 조사 보고서, 출처, AI fit 판단, 연락 조사 결과 | 후보 및 부적합·보류·미확보 조사 내역 |
| 3 | 적합하고 연락 선택지가 있는 기업 ‘오브릿’을 열기 | 기존 조사 및 현재 판단·연락 선택지 조회 | 개입 가능성·가치, 출처, 관계자 |
| 4 | 관계자 프로필을 확인하고 수신자·채널을 명시적으로 선택 | 선택한 사람 또는 공용 창구, 채널, 선택 버전 | 선택한 수신자와 전송 수단 |
| 5 | 공통 양식의 기업별 메시지를 수정하거나 요청을 입력해 재생성 | 새 초안 버전. 이전 초안 보존 | 제목·본문, 수신자 반영 보기/해제 |
| 6a | 이메일을 선택한 경우 최종 수신자·내용 확인 후 발송 | 메시지별 발송 접수·성공·실패·확인 중 상태 | 건별 전송 결과 |
| 6b | LinkedIn을 선택한 경우 제목·본문을 복사해 직접 전송 후 완료 표시 | 사용자의 수동 발송 확인 기록 | 전송 완료와 기록 시각 |
| 7 | 운영 지표 확인 | 실제 발송 시각으로 집계 | 9월 발송은 3분기 실적. 기업의 목표 분기는 4분기 유지 |

배치는 조사 실행 단위다. 기업의 발송이 끝날 때까지 배치를 실행 중으로 유지할 필요는 없다. 작업 접수 응답은 조사·발송 성공을 의미하지 않는다.

### 2.2 예외에서도 이어지는 흐름

| 상황 | 처리 | 보존할 것 |
| --- | --- | --- |
| AI가 부적합 또는 보류로 판단 | 후보 목록 밖의 배치 조사 내역에서 상세 열기. 사람이 직접 판단 변경 가능 | AI 원래 판단과 그 근거 |
| 적합하지만 연락 창구 미확보 | 조사 내역에 보관. 명시적 연락 추가 조사 요청 가능 | 기업 조사·fit 판단·미발견 결과 |
| 사람이 AI와 다르게 판단 | 상세에서 사람 판단 이력 추가. 시스템 재판단을 필수로 요청하지 않음 | 누가 언제 어떤 판단을 했는지, 선택 입력한 이유 |
| LinkedIn이 있지만 사람이 이메일을 선호 | 이메일 수신자·채널 선택 가능 | 두 연락 창구의 조사 정보 |
| 추가 조사는 성공했지만 창구를 찾지 못함 | 작업 성공 및 미발견 결과로 표시 | 기술 실패와 구별되는 결과 |
| 추가 조사 또는 초안 생성에 기술 오류 | 작업 실패와 오류 안내. 이전 유효 데이터 보존 | 기존 조사·초안 버전 |
| 미발송 기업을 다음 분기에 추진 | 현재 목표 분기 변경 | 최초 발견 배치·당시 목표 분기·이동 이력 |
| 기존 기업이 검색에 다시 등장 | 중복 기업 등록·자동 재조사 없이 기존 기록 재사용 | 최초 발견·기존 담당자·조사 기록. 추가 조사는 사람이 버튼 등으로 요청 |
| 이미 발송한 기업에 다시 연락하려 함 | 이번 최초 연락 계약의 적용 범위 밖 | 기존 발송 기록. 재접촉을 단순 분기 이동으로 처리하지 않음 |

예: 2분기에 발견했지만 미발송인 기업을 3분기로 옮기면, 3분기의 후보 목록에서 계속 작업한다. 원발견 배치는 2분기의 배치로 남는다. ‘중복 기업을 만들지 않는다’는 규칙이 ‘정보를 평생 갱신할 수 없다’는 뜻은 아니다.

## 3. 확정된 업무 정책

| ID | 정책 | API·데이터·화면에 미치는 영향 |
| --- | --- | --- |
| P-01 | 업무 목표 시기는 수주 목표 분기로 관리 | 신규 흐름에서 Cycle 선택 없음. 분기와 실제 발송 시각은 별도 |
| P-02 | 탐색을 시작한 팀원이 결과 기업의 첫 전송까지 담당 | 신규 배치 담당자는 로그인 사용자. 보완 조사·분기 이동에도 담당자 유지 |
| P-03 | 탐색 이름을 별도로 받지 않고 관심 기업 조건은 선택 | 누락·빈 문자열·공백은 null. 조건이 없어도 공통 fit 기준은 적용 |
| P-04 | 적합성은 구체적인 개입 영역의 개입 가능성과 개입 가치로 판단 | 판단과 근거·미확인 사항 보존. 공개 정보상 적합이 협업 확정을 뜻하지 않음 |
| P-05 | AI 판단과 사람 판단, 배치 담당자를 구분 | 사람이 변경한 판단을 현재 판단에 반영하고 AI 이력은 보존 |
| P-06 | fit 변경은 기업 상세의 근거 확인 맥락에서 제공 | 사람 판단 사유는 선택 입력. 서버도 권한·버전·기업 소속 확인 |
| P-07 | 적합하고 근거 있는 사용 가능 연락 선택지가 있는 기업이 활성 후보 | 부적합·보류·미확보는 조사 내역에 보존. 연락처 문자열 존재만으로 확정하지 않음 |
| P-08 | 같은 기업을 중복 등록하지 않으며 자동 재검토하지 않음 | 새 배치·분기 변경·시간 경과로 기존 기업 재조사를 시작하지 않음. 사람의 명시적 요청으로 새 조사 버전 생성 가능 |
| P-09 | 수신자와 전송 채널은 사람이 선택 | LinkedIn 존재가 이메일 발송 금지 또는 자동 채널 선택의 근거가 아님 |
| P-10 | 사람과 연락 수단을 분리하고 개인·팀·대표 메일을 표현 | 한 사람의 복수 채널, 사람이 없는 공용 이메일 지원 |
| P-11 | 신규 컨택의 이메일·LinkedIn 공통 제목·본문 템플릿 사용 | 기업별 초안은 같은 원본·버전을 참조. 두 채널 모두 제목 존재 |
| P-12 | 수신자 선택 전 초안 생성 가능, 편집·재생성 버전 보존 | 미해결 수신자 변수로 초안 보관 가능. 최종 내용 확정 전 발송 불가 |
| P-13 | 이메일은 사람이 채널을 선택하고 최종 수신자·내용을 확인한 건만 발송 | 벌크도 건별 확인 가능한 최종 렌더링과 결과 필요 |
| P-14 | LinkedIn은 사람이 직접 전송하고 완료 사실을 기록 | 복사는 발송 기록·실적 아님. 사용자 확인임을 표시 |
| P-15 | 실제 발송 시각의 한국 달력 분기로 메시지 수 집계 | 기업 수·초안 수·복사 수·발송 대기 수 제외 |
| P-16 | 미발송 기업의 현재 목표 분기만 변경 | 최초 발견 이력과 발송 기록은 변경하지 않음 |
| P-17 | 같은 요청의 재시도로 발송·이력을 중복 생성하지 않음 | 요청 멱등성과 메시지별 중복 방지 필요 |
| P-18 | 후보 목록은 하나, 기업별·배치별은 보기 방식 | 목록 전환으로 후보 복제·추가 작업을 만들지 않음 |
| P-19 | 사람이 기업 소속을 확인해 등록한 연락처는 즉시 선택 가능 | 형식·중복·소속 검사 및 등록 주체·시각·출처 또는 확인 사유 저장. AI 승인 단계 없음 |
| P-20 | 선택 소스는 기업 발견 범위, 후속 보완은 허용된 다른 출처 이용 가능 | 발견 소스와 실제 근거 출처를 구분해 저장. 접근 제한을 우회하지 않음 |
| P-21 | 이번 작업 화면은 신규 기업의 첫 성공 전송까지 | 성공 발송 또는 협업 이력 기업의 후속 작업은 별도 페이지. 기록은 삭제하지 않음 |
| P-22 | 추가 조사는 담당자의 작업이며 그 요청만으로 후보 제외·선택 초기화하지 않음 | 기존 유효 fit·연락처·초안·선택을 유지. 실제 유효성 변경 시에만 후보/전송 허용 여부 재계산 |
| P-23 | 팀원은 본인 업무 변경·타인 업무 조회, 팀장은 전체 업무 변경 | UI와 서버에서 동일 적용. fit·연락처·재조사·초안·수신자/채널·분기 이동·전송·수동 완료 기록을 모두 포함 |
| P-24 | 배치 보기의 전체 선택은 해당 배치 전체를 한 번에 선택/해제 | 현재 필터에 해당하는 배치 후보 중 작업 권한이 있는 기업 대상. 표시 페이지가 나뉘어도 배치 범위 유지. 확장 안내나 다른 배치까지 한 번에 선택하는 버튼 없음 |

`사용 가능`은 조사 또는 사람의 확인상 연락 선택지로 쓸 수 있다는 평가다. 실제 메시지 수신·답장 또는 LinkedIn 활동성을 보장하지 않는다. 수동 입력도 주소 형식·기업 소속·중복 검사를 통과해야 하며, 사람의 확인을 AI 검증 결과로 표시하지 않는다.

## 4. 개념과 관계: 무엇을 왜 나눠 저장하는가

### 4.1 용어 사전

| 업무 개념 | 모델 이름 | 저장하는 내용과 필요한 이유 |
| --- | --- | --- |
| 목표 분기 | TargetQuarter | 컨택·수주를 추진할 연도와 분기 |
| 탐색 배치 | SearchRun | 누가 어떤 조건으로 한 번의 탐색을 실행했는지 |
| 기업 | Company | 분기·배치가 달라도 같은 기업을 식별하는 기준 |
| 조사 관리 기록 | InvestigationResult | 기업의 최초 발견 배치와 현재 조사·판단 참조. v0.1 API의 Candidate에 대응 |
| 조사 보고서 | CompanyResearch | 특정 시점의 조사 내용. 추가 조사마다 별도 버전 |
| 근거 | Evidence | 출처 URL·발췌·게시/확인 시각 |
| 시스템 판단 | FitAssessment | AI가 어떤 보고서·근거로 내린 판단인지 |
| 사람 판단 | HumanFitDecision | 사람이 변경한 판단·이유·주체·시각 |
| 관계자 | Contact | 이름·소속·직무 등 사람 정보 |
| 연락 수단 | ContactEndpoint | 이메일 주소·LinkedIn 프로필. 공용 이메일은 사람이 없을 수 있음 |
| 연락 선택지 평가 | ContactOptionAssessment | 해당 창구의 현재 사용 가능·검증 필요·사용 불가 평가 |
| 현재 연락 작업 | Outreach | 현재 목표 분기·선택한 수신자/채널·초안 참조. 별도 페이지를 뜻하지 않음 |
| 공통 양식·초안 | Template / DraftRevision | 양식과 기업별 메시지의 버전 |
| 발송 기록 | SentMessage | 실제 수신 경로·제목·본문·시각·성공 확인 방법 |
| 비동기 작업 | Task | 조사·생성 요청의 접수·진행·결과·오류 |

```text
목표 분기 ─ 여러 탐색 배치 ─ 최초 발견 조사 관리 기록 ─ 기업
                                  │                  ├ 여러 조사 보고서·근거
                                  ├ AI·사람 판단     └ 여러 관계자·연락 수단

기업 ─ 현재 연락 작업 ─ 현재 목표 분기 / 선택한 수신자·채널
                    ├ 여러 초안 버전
                    └ 발송 시도·완료 기록
```

분기와 배치는 신규 서비스의 개념이다. 기존 Cycle은 §8 이관 설명에만 등장하며 신규 입력에서 사용하지 않는다. API 경로 `/companies/{id}/workspace`의 workspace는 기업 상세 화면용 묶음 응답이며, 조직별 데이터 분리를 뜻하는 workspaceId가 아니다.

### 4.2 저장 값과 계산 값

- 저장: 원본 조사·근거, 판단 이력, 사람의 선택, 초안 버전, 발송 이벤트.
- 계산: 현재 유효 fit, 활성 후보 여부, 분기 발송 수, 화면에서 가능한 동작.
- 현재 유효 fit은 유효한 사람 판단이 있으면 그 판단, 없으면 최신 시스템 판단이다. 사람의 이유가 비어 있다고 AI 설명을 사람의 이유로 대신 채우지 않는다.
- 활성 후보는 현재 fit과 사용 가능 연락처, 최초 연락 대상 여부를 서버가 계산한다. 추가 조사 요청 자체를 뜻하는 `needsResearch` 값을 후보 제외 조건에 넣지 않는다.
- 발송 완료 기록은 이후 판단이 달라져도 보존한다. `활성 후보`와 `전송 이력`은 별개이며, 기존 전송·협업 이력은 별도 페이지의 조회 대상이다.

### 4.3 표기와 기본 타입

- 문서의 논리 필드와 HTTP JSON·쿼리 키는 camelCase: `targetQuarterId`, `createdAt`, `expectedRevision`.
- 기존 DB의 테이블·컬럼은 snake_case 유지 가능: `target_quarter_id`, `created_at`. ORM 또는 서버 직렬화가 매핑한다.
- `Id`는 외부에서 불투명한 문자열이다. v0.1의 UUID와 현행 로컬 Prisma의 CUID 차이는 이관 시 실제 구현을 대조한다. 기존 ID를 이름 변경만으로 새로 발급하지 않는다.
- 시각은 UTC ISO 8601. UI 표시는 한국 시간, 분기 집계 경계는 `Asia/Seoul`.
- 아래 스키마에서 `?`는 null 가능 값이다. 응답에는 원칙적으로 null을 명시한다. 요청의 생략·필수 여부는 각 API 계약이 정한다.

## 5. 데이터 스키마 — 구현 계약안

### 5.1 v0.1 개념의 유지·수정

모든 영속 레코드는 별도 표기가 없어도 `id`를 가진다. 가변 상태는 `updatedAt` 및 충돌 확인용 버전, 이력은 `createdAt`을 가진다. 아래는 논리 필드이며 DB 이름은 매핑 가능하다.

| 모델 | 필드·타입 | 관계·정책 |
| --- | --- | --- |
| SearchRun | `targetQuarterId:Id`, `createdBy:Id`, `assignedMemberId:Id`, `conditionsSnapshot:object`, `status:SearchRunStatus`, `finishReason:string?`, `createdAt`, `startedAt?`, `finishedAt?` | 분기·사용자 FK. 신규 담당자는 인증 사용자. 조건은 생성 당시 고정. 실행 정책 기본값은 정의하지 않음. P-01~03 |
| Company | `name:string`, `legalName:string?`, `product:string?`, `websiteUrl:string?`, `canonicalDomain:string?`, `aliases:string[]`, `permanentlyExcluded:boolean`, `version:number` | 공식 URL·명칭 등으로 식별. 이름·도메인 하나만으로 자동 병합하지 않음. P-08 |
| InvestigationResult | `companyId:Id`, `originSearchRunId:Id`, `currentResearchId:Id?`, `latestSystemAssessmentId:Id?`, `activeHumanDecisionId:Id?`, `contactResearchStatus:ContactResearchStatus`, `revision:number` | 기업의 현재 조사 상태와 최초 발견 참조. API의 `candidateId`는 이 ID. 조사 보고서 횟수와 별개. P-04~08 |
| CompanyResearch | `companyId:Id`, `originSearchRunId:Id`, `taskId:Id`, `claims:Claim[]`, `missingInformation:string[]`, `createdAt` | append-only. 추가 조사는 새 보고서로 저장. 현재 참조만 교체. P-04,08 |
| Evidence | `companyId:Id`, `searchRunId:Id?`, `url:string`, `sourceKey:string`, `title:string?`, `excerpt:string?`, `publishedAt:datetime?`, `retrievedAt:datetime` | 출처 게시일과 확인일 구분. 사실 주장과 출처 연결. P-04 |
| FitAssessment | `candidateId:Id`, `researchId:Id`, `verdict:fit/unfit/pending`, `summary:string`, `interventions:Intervention[]`, `informationGaps:string[]`, `criteriaVersion:string`, `modelVersion:string?`, `createdAt` | append-only. 판단 당시 자료 보존. P-04,05 |
| HumanFitDecision | `candidateId:Id`, `verdict:fit/unfit/pending`, `reason:string?`, `interventionNote:string?`, `basedOnAssessmentId:Id?`, `decidedBy:Id`, `createdAt` | append-only. 사용자에서 판단 주체 결정. 사유 선택. P-05,06 |
| Contact | `companyId:Id`, `name:string`, `role:string?`, `employmentStatus:current/former/unknown`, `employmentCheckedAt:datetime?`, `evidenceIds:Id[]` | 같은 이름의 사람을 자동 병합하지 않음. P-10 |
| ContactEndpoint | `companyId:Id`, `contactId:Id?`, `ownerType:person/team/company`, `channel:email/linkedin`, `address:string`, `evidenceIds:Id[]`, `checkedAt:datetime?` | person이면 사람 참조 필요. team/company 이메일은 contactId=null 가능. LinkedIn은 개인 프로필. P-09,10 |
| ContactOptionAssessment | `candidateId:Id`, `endpointId:Id`, `status:usable/needs_verification/unusable`, `reason:string?`, `roleRelevance:string?`, `decisionAuthority:string?`, `checkedAt:datetime`, `confirmedBy:Id?`, `sourceUrl:string?` | 수동 확인은 인증 사용자를 confirmedBy에 기록하고 checkedAt에 서버 시각 저장. sourceUrl 또는 reason으로 확인 근거 보존. 조사 평가는 confirmedBy=null. 자동 채널 선택·활동성 점수와 다름. P-07,09,19 |

`Claim = { category:string, content:string, basis:'reported_fact'|'inference', evidenceIds:Id[] }`.

`Intervention = { area:string, possibility:{ assessment:'supported'|'unsupported'|'unknown', reason:string, evidenceIds:Id[] }, value:{ assessment:'supported'|'unsupported'|'unknown', reason:string, evidenceIds:Id[] }, prerequisites:string[] }`.

사실 claim은 출처 참조가 있어야 한다. 추론을 사실처럼 표시하지 않는다. 같은 개입 영역의 가능성과 가치가 함께 뒷받침되는지 판단하고, 필요한 정보가 없으면 보류로 표현한다.

물리 구현 시 현재 조사 관리 기록을 기업별 하나로 두는 제약은 가능하다. 이 제약은 **추가 보고서·판단·작업의 개수를 제한하는 제약이 아니다.** ‘기업은 평생 한 번만 조사’라는 제약은 만들지 않는다. 사람의 명시적 재조사 요청은 동일 기업 ID에 새 작업·이력으로 연결한다. 자동 재검토 스케줄러는 만들지 않는다.

### 5.2 v0.1 대비 새 개념 및 기존 DB 확장

새 논리 개념이라고 반드시 새 테이블을 만들지는 않는다. 기존 DB의 Outreach·Template·초안·발송 테이블은 확장 우선이다.

| 모델 | 필드·타입 | 관계·정책 |
| --- | --- | --- |
| TargetQuarter | `year:integer`, `quarter:1/2/3/4`, `createdAt` | `(year,quarter)` 유일. 목표 라벨이며 실행 날짜를 제한하지 않음. P-01 |
| Outreach | `companyId:Id`, `originSearchRunId:Id`, `currentTargetQuarterId:Id`, `ownerId:Id`, `recipientContactId:Id?`, `recipientEndpointId:Id?`, `selectedChannel:email/linkedin/null`, `selectionVersion:number`, `currentDraftRevision:number?`, `version:number` | 신규 ownerId는 원배치 SearchRun.assignedMemberId와 동일. 보완·분기 이동에도 유지. 원발견 불변. P-02,09,16,18 |
| OutreachTargetQuarterChange | `outreachId:Id`, `fromTargetQuarterId:Id`, `toTargetQuarterId:Id`, `changedBy:Id`, `changedAt:datetime`, `reason:string?` | 현재 분기 변경과 같은 트랜잭션에 이력 추가. P-16 |
| Template | `route:string`, `version:number`, `subject:string`, `body:string`, `requiredVariables:string[]`, `active:boolean` | 신규 연락의 채널 공통 원본. 관리·게시 API는 제외. P-11 |
| DraftRevision | `outreachId:Id`, `revision:number`, `templateId:Id`, `templateVersion:number`, `topic:string?`, `subject:string`, `body:string`, `generationInstruction:string?`, `createdBy:Id?`, `selectionVersion:number`, `createdAt` | `(outreachId,revision)` 유일, append-only. 미해결 변수는 초안에만 허용. P-11,12 |
| SentMessage | `outreachId:Id`, `targetQuarterId:Id`, `channel:email/linkedin`, `recipientContactId:Id?`, `recipientEndpointId:Id`, `recipientNameSnapshot:string?`, `addressSnapshot:string`, `subjectSnapshot:string`, `bodySnapshot:string`, `draftRevision:number`, `templateId:Id?`, `templateVersion:number?`, `status:SendStatus`, `sentAt:datetime?`, `sentAtSource:providerAck/userProvided/confirmationTime/null`, `sendRequestKey:string`, `providerMessageId:string?`, `confirmationMethod:email_provider_ack/linkedin_manual/null`, `confirmedByMemberId:Id?`, `recordedAt:datetime`, `error:TaskError?` | 시도 상태는 갱신 가능, 발송 완료 내용은 고정. 기록 배열이 반복 발송 권한을 뜻하지 않음. P-13~17 |
| Task | `kind:research/draftGeneration`, `searchRunId:Id?`, `candidateId:Id?`, `outreachId:Id?`, `type:string`, `trigger:searchRun/userRequest`, `requestedInformation:string[]`, `status:TaskStatus`, `attempt:number`, `resultRefs:ResultRef[]`, `error:TaskError?`, `createdAt`, `startedAt?`, `finishedAt?` | 작업 큐 Job에 연결 가능. 회사/연락 추가 조사는 ResearchTask 확장으로 구현. 생성 작업과 조사 작업의 대상 검증 분리 |

`ResultRef = { type:'companyResearch'|'fitAssessment'|'contactEndpoint'|'draftRevision', id:Id }`.

`TaskError = { code:string, message:string, retryable:boolean, details:Record<string,unknown>|null }`.

물리 테이블 후보: 신규 `target_quarters`, `evidence`, `company_research`, `investigation_results`, `fit_assessments`, `human_fit_decisions`, `contact_option_assessments`, `research_tasks`, `outreach_target_quarter_changes`. 기존 `companies`, `contacts`, `contact_endpoints`, `outreaches`, `templates`, `message_draft_revisions`, `sent_messages`, `jobs`는 재사용·확장한다. Task는 API용 공통 읽기 형식이며 모든 작업을 한 새 테이블에 넣으라는 요구가 아니다.

### 5.3 상태와 무결성

| 타입 | 상태 | 해석 |
| --- | --- | --- |
| SearchRunStatus | `queued`, `running`, `completed`, `partially_completed`, `failed`, `cancelled` | 배치 실행 결과. 보류·부적합·미발견 자체는 기술 실패가 아님 |
| TaskStatus | `queued`, `running`, `succeeded`, `failed`, `cancelled` | 단일 비동기 작업. 성공에 빈 결과 포함 가능 |
| ContactResearchStatus | `not_started`, `searching`, `available`, `needs_verification`, `not_found`, `failed` | 기업의 연락 조사 현황. 발송 상태와 구분 |
| SendStatus | `queued`, `sending`, `sent`, `failed`, `unknown` | 성공 확인 전 sent로 만들지 않음. unknown은 발송 여부 확인이 필요한 상태 |

camelCase 원칙은 **필드명**에 적용한다. 이미 정의된 상태·작업 종류 등의 enum 값은 `partially_completed`, `contact_research`처럼 기존 값을 유지한다. 새 enum은 본문에 적힌 값으로 정의한다. 필드명 변경에 맞춰 enum·DB 값을 일괄 개명하지 않는다.

- 분기 값은 DB CHECK, 분기 중복은 UNIQUE로 제한한다.
- 연락 창구·판단·근거·초안 참조가 같은 기업에 속하는지 검증한다. 가능한 관계는 FK로 연결하고, JSON 내부 근거 ID는 서비스가 검증한다.
- `status=sent`이면 `sentAt` 필수. 이메일은 공급자 성공 확인, LinkedIn은 사용자 확인 주체를 보존한다.
- 메시지별 `sendRequestKey`는 유일하다. 이 키는 같은 발송 시도의 재요청을 식별한다. 의도적인 추가 발송의 허용 정책은 정의하지 않는다.
- 가변 작업의 version과 조사 관리 기록의 revision은 해당 상태 변경과 함께 증가한다.
- 실제 외부 API 호출은 DB 트랜잭션을 길게 점유하지 않도록 접수·외부 실행·결과 저장을 나눈다.
- 이력을 참조하는 행은 연쇄 삭제보다 보존을 우선한다. 실제 FK 삭제 정책은 마이그레이션에 명시한다.

## 6. API 명세 — camelCase 구현 계약안

### 6.1 공통 계약과 기존 API 경계

- 기본 경로 `/api/v1`, JSON, 인증 사용자 필요. 예시에서는 기본 경로를 생략한다.
- HTTP JSON의 모든 계층과 쿼리 키는 camelCase다. URL은 `/search-runs`처럼 기존 경로를 유지한다. HTTP 표준 헤더 `Idempotency-Key` 및 오류 코드 `REVISION_CONFLICT`는 필드명 규칙의 대상이 아니다.
- 신규 리스트업 단건: `{ "data": Resource }`.
- 신규 리스트업 목록: `{ "data": Resource[], "page": { "nextCursor": null, "hasMore": false } }`.
- 신규 리스트업 오류: `{ "error": { "code": "...", "message": "...", "details": {}, "requestId": "..." } }`.
- 기존 대협봇의 `GET /search-options`, `GET /template-bindings`, `PUT /outreaches/{id}/recipient`, `GET/PATCH /drafts/{outreachId}`, `GET /sends/{sendId}`는 현행 응답 봉투를 유지한다. 단건은 `{data,requestId}`, 오류는 `{error:{code,message,fieldErrors?,retryable},requestId}`. 목록형 응답도 경로별 기존 형태를 유지한다. **이것은 표기법 예외가 아니라 응답 구조의 호환 경계다.** 프론트 API 계층에서 정규화한다.
- camelCase 전환만으로 배열 위치·페이지 구조·오류 코드까지 자동 변경하지 않는다. v0.1을 구현한 클라이언트와 서버의 전환은 §8 절차를 따른다.
- 목록 `limit`은 기존 v0.1 규약인 기본 20/최대 100, `cursor`는 불투명 문자열. 명시적 예외가 없으면 `(createdAt DESC,id DESC)` 정렬. 이것은 조회 페이지 크기이며 조사 기업 수 정책이 아니다.
- 작업·이력 생성 POST는 `Idempotency-Key` 필요. 신규 상태 변경 PATCH에도 적용한다. 읽기 전용 `/email-sends/preview`는 제외. 기존 대협봇 경로에는 새 필수 헤더를 소급 강제하지 않는다.
- 같은 사용자·경로·키·본문의 재요청은 같은 결과, 같은 키와 다른 본문은 409. 멱등 응답 조회를 상태·버전 검사보다 먼저 한다. 키 보존은 기존 v0.1 기준 최소 24시간이며 메시지별 발송 중복 방지는 별도로 유지한다.
- 사용자 ID, 생성/판단/확인 시각, 버전, 파생 상태는 서버가 결정한다. 담당자·판단 주체를 요청 본문으로 사칭할 수 없다.
- `201` 생성, `202` 비동기 접수, `200` 조회·변경. `202`를 조사·발송 성공으로 표시하지 않는다.
- 조회 전용 `allowedActions`는 UI 안내다. 변경 요청 때 서버가 권한·fit·선택·버전·현재 상태를 다시 확인한다.
- **권한 계약(P-23):** 역할·사용자 ID는 서버가 인증 정보에서 확인한다. 탐색 생성 시 인증 사용자가 담당자이고, 기존 기업의 변경은 Outreach.ownerId(작업 생성 전 조사 기록은 원배치 assignedMemberId)와 인증 사용자 일치 또는 팀장 권한이 필요하다. 조회는 다른 담당자에게도 허용한다. 단건 무권한 변경은 403 FORBIDDEN. 벌크는 항목별로 같은 검사를 적용해 무권한 건을 rejected 처리하고 큐에 넣지 않는다. 승인 후 실행 전에도 필요한 권한·상태를 재검증한다. 요청 본문 role/ownerId로 권한을 얻거나 원 담당자를 덮어쓸 수 없다.
- **UI 반영:** 기본 필터는 팀원 ‘내 담당’, 팀장 ‘담당자 전체’. 타인 상세에는 조회 전용 안내를 표시하고 수정·전송 동작을 제공하지 않는다. 사용자 필터 변경은 조회 범위 변경일 뿐 권한 변경이 아니다. 목업의 사용자 전환기는 권한 시연 전용이며 실제 제품에는 포함하지 않는다.

### 6.2 공통 DTO

```typescript
type Id = string;
type DateTime = string; // UTC ISO 8601
type ActorRef = { id: Id; displayName: string };
type TargetQuarter = { id: Id; year: number; quarter: 1 | 2 | 3 | 4 };
type FitSummary = {
  effectiveVerdict: 'fit' | 'unfit' | 'pending' | 'not_assessed';
  decisionSource: 'system' | 'human' | 'none';
  systemVerdict: 'fit' | 'unfit' | 'pending' | null;
  humanVerdict: 'fit' | 'unfit' | 'pending' | null;
  systemSummary: string | null;
  humanReason: string | null;
  decidedBy: ActorRef | null;
  decidedAt: DateTime | null;
};
type ContactSummary = {
  researchStatus: ContactResearchStatus;
  usableCount: number;
  needsVerificationCount: number;
  channels: Array<'email' | 'linkedin'>;
};
type SelectedRecipient = {
  contactId: Id | null;
  endpointId: Id;
  channel: 'email' | 'linkedin';
};
type CandidateListItem = {
  companyId: Id;
  candidateId: Id;
  outreachId: Id;
  originSearchRunId: Id;
  originTargetQuarterId: Id;
  currentTargetQuarterId: Id;
  companyName: string;
  product: string | null;
  interventionArea: string | null;
  fit: FitSummary;
  contacts: ContactSummary;
  assignedMember: ActorRef | null; // null은 담당자를 모르는 과거 행
  selectedRecipient: SelectedRecipient | null;
  latestSend: { id: Id; status: SendStatus; sentAt: DateTime | null } | null;
  isActiveCandidate: boolean;
  allowedActions: string[];
  updatedAt: DateTime;
};
```

§5의 모델과 상태 타입이 위 DTO에서 참조하는 나머지 타입 정의다. CandidateListItem은 화면용 묶음이며 같은 모양의 DB 테이블을 만들 필요가 없다. 전송 완료 이력 행은 `isActiveCandidate=false`여도 이력 보기에서 조회할 수 있다.

### 6.3 엔드포인트와 사용자 행동

| 사용자 행동 | Method / 경로 | 계약 분류 |
| --- | --- | --- |
| 분기 선택·추가 | `GET/POST /target-quarters` | 신규 |
| 탐색 시작·배치 목록·진행 조회 | `POST/GET /search-runs`, `GET /search-runs/{id}` | v0.1 확장 |
| 탐색 취소 | `POST /search-runs/{id}/cancel` | v0.1 유지·camelCase 응답 |
| 배치의 전체 조사 내역 조회 | `GET /search-runs/{id}/results` | 신규 읽기 뷰 |
| 기존 조사 관리 기록 조회 | `GET /candidates`, `GET /candidates/{id}` | v0.1 유지·camelCase 전환 |
| 후보의 기업별·배치별 보기 | `GET /outreach-candidates`, `GET /outreach-candidates/groups` | 신규 읽기 뷰 |
| 기업 상세 열기 | `GET /companies/{id}/workspace` | 신규 읽기 뷰 |
| 당시 보고서·출처 열기 | `GET /company-research/{id}`, `GET /evidence/{id}` | v0.1 유지 |
| 판단 이력 조회·사람 판단 저장 | `GET /candidates/{id}/fit-assessments`, `GET/POST /candidates/{id}/human-fit-decisions` | v0.1 유지 |
| 연락 선택지 조회 | `GET /candidates/{id}/contacts` | v0.1 유지·확장 |
| 확인한 연락처 수동 추가 | `POST /candidates/{id}/contact-endpoints` | 신규 계약안, §6.7 |
| 명시적 추가 조사 | `POST /candidates/{id}/research-requests` | v0.1 유지 |
| 작업 진행 조회 | `GET /tasks`, `GET /tasks/{id}` | v0.1 조사 + 생성 읽기 모델 확장 |
| 사람·채널 선택 | `PUT /outreaches/{id}/recipient` | 기존 대협봇 확장 |
| 미발송 기업 목표 분기 변경 | `PATCH /outreaches/{id}/target-quarter` | 신규 |
| 초안 생성·재생성 | `POST /outreaches/{id}/draft-generations` | 신규 |
| 초안 조회·편집 | `GET/PATCH /drafts/{outreachId}` | 기존 대협봇 확장 |
| 이전 초안 버전 조회 | `GET /outreaches/{id}/draft-revisions` | 신규 |
| 이메일 최종 확인·전송 | `POST /email-sends/preview`, `POST /email-sends/bulk` | 신규 |
| LinkedIn 직접 전송 확인 | `POST /outreaches/{id}/manual-send-records` | 신규 |
| 전송 상태·이력 조회 | `GET /sends/{sendId}`, `GET /outreaches/{id}/sends` | 기존 단건 유지 + 신규 목록 |
| 분기 발송 수 조회 | `GET /quarterly-send-metrics` | 신규 |

제외한 수동 연락처 생성·보류 판단·자동 재검토·반복 발송 정책·조사 재시도 한도의 계약은 이 표에 추가하지 않는다. 기존 기능을 삭제하라는 의미는 아니며 이번 버전에서 변경 계약을 정하지 않는다는 뜻이다.

### 6.4 목표 분기와 탐색 접수

**사용 맥락:** 새 탐색에서 이번에 추진할 목표 분기를 선택하고 조건·소스를 전달한다. P-01~03.

- `GET /target-quarters?limit=20&cursor=...`: TargetQuarter 목록. `(year DESC,quarter DESC)` 정렬.
- `POST /target-quarters`: `{ "year": 2026, "quarter": 4 }`. 201 TargetQuarter. 같은 연도·분기 존재 시 `409 ALREADY_EXISTS`, `error.details.existingId`에 기존 ID.
- `POST /search-runs` 요청 예시:

```json
{
  "targetQuarterId": "quarter-q4",
  "sources": [
    { "key": "google", "name": "Google", "entryUrls": [], "query": null }
  ],
  "filters": {
    "industries": [],
    "keywords": [],
    "regions": [],
    "companyStages": [],
    "excludedCompanyIds": [],
    "additionalConditions": null
  }
}
```

필수는 `targetQuarterId`, 지원 소스 한 개 이상의 `sources`, `filters`다. 필터 배열의 빈 값은 해당 조건으로 제한하지 않음을 뜻한다. `filters.additionalConditions`만 생략 가능하며 null·빈 문자열·공백은 null로 정규화한다. 소스 이름은 표시용이며 key를 서버 설정에서 검증한다. 탐색 이름·담당자·Cycle ID를 받지 않는다.

선택한 sources는 **기업 발견**에 적용한다. 발견 이후 기업 정보·연락 창구 보완은 접근이 허용된 다른 출처를 사용할 수 있으며 실제 근거 URL을 남긴다. 이 정책을 사용자가 별도 sourcePolicy 필드로 선택하게 하지 않는다.

**이 예시는 업무 입력 계약이다.** §0.2의 `limits`, 수집기별 실행·반복·종료 정책을 생략한 채 운영 워커가 임의의 기본값으로 실행하라는 뜻이 아니다. 기존 v0.1 실행 옵션은 별도로 대조한다. 실행 정책이 연결되기 전에는 접수·작업 상태를 mock으로 검증하되 실제 워커 완료로 인계하지 않는다.

202 응답: `{ data: { searchRun: SearchRun, initialTask: Task } }`, `Location: /api/v1/search-runs/{id}`. SearchRun의 API 읽기 모델은 §5.1 필드에 입력의 `sources`, `filters`를 펼쳐 제공한다. `conditionsSnapshot`에는 사용한 업무 입력과 실제 실행 설정의 스냅샷을 보존한다. 실행 설정 내용은 후속 계약 대상이다.

- `GET /search-runs?targetQuarterId=...&assignedMemberId=...&status=...&limit=...&cursor=...`: SearchRun 목록.
- `GET /search-runs/{id}`: `{ data: { searchRun, counts } }`. counts 키는 `candidates`, `fit`, `unfit`, `pending`, `notAssessed`, `fitWithAvailableContact`, `activeTasks`, `failedTasks`, `noContact`, `eligible`. 현재 유효 판단을 기준으로 집계하므로 배치 종료 뒤에도 값이 바뀔 수 있다.
- `POST /search-runs/{id}/cancel`: 본문 없음. queued/running 실행의 취소 요청, 200 SearchRun. 중단 확인 전 진행 중인 작업을 성공으로 표시하지 않는다. 원래 결과를 삭제하지 않고, 배치 종료 후 사용자가 요청한 독립 작업을 함께 취소하지 않는다.

### 6.5 후보 목록·배치 보기·조사 내역

**사용 맥락:** 한 후보 목록을 기업별 또는 배치별로 본다. 부적합·보류·미확보는 배치 조사 내역으로 열 수 있다. P-07,18.

`GET /outreach-candidates?targetQuarterId=...&searchRunId=...&assignedMemberId=...&sendStatus=...&q=...&limit=...&cursor=...`

- `targetQuarterId` 필수, 나머지 필터 선택. 반환 항목은 CandidateListItem.
- 분기 필터는 Outreach의 **현재** 목표 분기에 적용한다. 원발견 배치가 과거 분기여도 현재 분기가 일치하면 포함한다.
- `sendStatus`: `unsent`, `queued`, `sending`, `failed`, `unknown`. 생략 시 최초 연락 대상인 활성 후보를 조회한다. `sent`는 신규 목록 필터가 아니므로 422로 거절한다. 접수 중·결과 불명 상태도 구분하며 즉시 재전송 가능하다는 뜻이 아니다.
- 성공 발송 또는 협업 이력이 있는 기업은 신규 후보 목록에서 제외한다. 성공 기록은 `/outreaches/{id}/sends` 등 이력 조회로 보존하며 별도 페이지에서 다룬다. 기업의 기존 협업 이력 판정은 기존 시스템의 실제 기록과 연결해야 하며, 새 화면에서 보낸 기록만 검사하면 안 된다. 이력 화면과 협업 데이터 연결 상세는 별도 작업으로 인계한다.

`GET /outreach-candidates/groups`는 동일 필터 중 `searchRunId`를 제외하고 받는다. 같은 페이지 봉투로 `{ searchRunId, originTargetQuarterId, assignedMember, createdAt, additionalConditions, candidateCount }[]`를 반환한다. candidateCount는 필터된 전체 행 수이며 현재 로딩한 페이지 길이가 아니다. 그룹을 펼치면 같은 후보 API에 searchRunId를 전달한다.

`GET /search-runs/{id}/results?bucket=all|eligible|exceptions&limit=...&cursor=...`는 배치의 조사 기록을 반환한다. all 기본. 각 항목은 `{ candidateId, companyId, originSearchRunId, revision, companyName, product, fit, contacts, eligibility, outreachId, updatedAt }`. `eligibility`는 `eligible`, `unfit`, `pending`, `no_contact`, `not_assessed`, `excluded`. fit은 FitSummary, contacts는 ContactSummary, outreachId는 null 가능이다. 배치 내역은 원발견 기준이며 현재 작업 분기를 바꿔도 이 참조는 바뀌지 않는다.

기존 `GET /candidates`는 v0.1의 조사 목록 의미를 유지한다. `searchRunId`, `companyId`, `effectiveFit`, `limit`, `cursor` 등 기존 필터를 camelCase로 제공한다. 새 `/outreach-candidates`와 동일한 활성 후보 전용 목록으로 바꾸지 않는다.

### 6.6 기업 상세·출처·판단

**사용 맥락:** 기업을 열어 판단 근거와 연락 선택지, 메시지를 함께 확인한다. P-04~07.

`GET /companies/{id}/workspace?targetQuarterId=...`의 data:

```typescript
type CompanyWorkspace = {
  company: Company;
  investigation: {
    candidateId: Id;
    originSearchRunId: Id;
    revision: number;
    fit: FitSummary;
    currentResearch: CompanyResearch | null;
    latestSystemAssessment: FitAssessment | null;
    activeHumanDecision: HumanFitDecision | null;
    evidence: Evidence[];
    contactResearchStatus: ContactResearchStatus;
  } | null;
  contactOptions: Array<{
    evaluation: ContactOptionAssessment;
    channel: ContactEndpoint;
    person: Contact | null;
    evidence: Evidence[];
  }>;
  contactsNextCursor: string | null;
  outreach: Outreach | null;
  currentDraft: DraftRevision | null;
  latestSends: SentMessage[];
  sendsNextCursor: string | null;
  activeTasks: Task[];
  allowedActions: string[];
  blockedReasons: string[];
};
```

각 모델 필드는 §5에 정의한다. 후보가 아닌 조사 예외 기업도 같은 상세에서 열 수 있다. 연락처·발송 이력은 일부만 포함하고 다음 커서로 이어 읽는다. outreach가 없다고 조사 근거를 숨기지 않는다. 요청 분기는 조회 맥락이며 값을 변경하는 동작이 아니다.

- `GET /candidates/{id}`는 조사 중심 상세: `{candidate,company,currentResearch,latestSystemAssessment,activeHumanDecision,evidence,contactCounts,activeTasks,latestFailedTask}`. candidate는 InvestigationResult, contactCounts는 `usable/needsVerification/unusable` 개수다.
- `GET /company-research/{id}`와 `GET /evidence/{id}`는 해당 시점 자료를 반환한다.
- `GET /candidates/{id}/fit-assessments`, `/human-fit-decisions`는 각각의 이력을 공통 페이지네이션으로 반환한다.

사람이 fit을 변경할 때 `POST /candidates/{id}/human-fit-decisions`:

```json
{
  "expectedRevision": 3,
  "verdict": "fit",
  "reason": "첫 사용 전환 구간에 직접 실험할 수 있다고 판단",
  "interventionNote": "온보딩 실험",
  "basedOnAssessmentId": "assessment-1"
}
```

expectedRevision·verdict 필수, 나머지는 생략 시 null. 후보 revision 일치와 참조 소속을 검사한다. 201 `{data:{decision,candidate,followup}}`; followup은 `{action:'task_created'|'task_reused'|'contacts_reused'|'none',taskId:Id|null,reason:string|null}`. 이 판단 저장 API는 자동 조사를 시작하지 않으며, 기존 유효 창구를 재사용하면 contacts_reused, 그 외 none을 반환한다. 필요한 조사는 사람이 별도 요청한다. 이전 응답 타입의 task_created/task_reused를 이 API의 자동 실행 허가로 해석하지 않는다.

사람의 판단은 즉시 현재 판단에 반영한다. AI 보고서를 덮어쓰거나 AI 재판단을 강제하지 않는다. 부적합·보류로 바뀐 기업은 아직 외부로 보내지 않은 신규 전송 단계에서 다시 검증해 차단한다. 이미 발송된 기록은 보존한다.

### 6.7 연락 선택지·명시적 추가 조사·작업 조회

**사용 맥락:** 프로필·이메일·출처를 확인하고 부족한 정보를 추가 조사한다. P-07,09,10.

- `GET /candidates/{id}/contacts?type=email|linkedin&status=...&limit=...&cursor=...`: `{evaluation,channel,person,evidence}[]`. status는 `usable/needs_verification/unusable`. 기존 person/channel 리소스를 camelCase 필드로 직렬화한다. 공용 창구의 person은 null. 기존 priority 필터가 구현돼 있으면 호환 처리하되 자동 채널 선택 권한으로 사용하지 않는다.
- `POST /candidates/{id}/research-requests`: `{ "type": "contact_research", "requestedInformation": ["현재 재직 중인 프로덕트 담당자의 공개 연락처 확인"] }`.
- type은 `company_research`, `contact_research`, `contact_verification`; 검증 대상이 명확하면 선택 `contactChannelId`를 전달한다. 이 필드는 v0.1 ContactChannel에 대응하는 ContactEndpoint의 ID이며 다른 기업 창구를 지정할 수 없다. requestedInformation은 구체적인 요청 1개 이상. 연락 조사·검증은 현재 fit=fit 필요. 기업 조사 보완은 다른 fit 상태에서도 가능하다.
- 202 `{data:{task,reused:false}}`; 동등한 실행 중 요청을 재사용할 때 `{data:{task,reused:true}}`. `Location: /api/v1/tasks/{id}`.
- 추가 조사 성공은 기존 보고서에 덮어쓰지 않고 새 보고서·창구 평가를 연결한다. 종료한 원배치를 running으로 돌리지 않는다. 사람의 fit 판단을 자동 변경하지 않는다.
- 요청은 `trigger=userRequest`로 기록한다. 기존 기업 재발견·분기 변경·시간 경과만으로 자동 요청하지 않는다. 요청 시 기존 담당자·수신자·채널·유효 보고서를 유지한다. 조사 중/미발견/기술 실패 자체로 기존 유효 창구를 폐기하지 않으며 실제 무효 근거가 있을 때만 별도 평가로 갱신한다.
- `GET /tasks/{id}`: §5.2 Task. `GET /tasks?searchRunId=...&candidateId=...&outreachId=...&status=...&limit=...&cursor=...`: 공통 목록.
- 성공 후 새 창구 미발견이면 작업은 `status=succeeded`, 해당 작업의 결과는 not_found. 기존 사용 가능 창구가 있으면 기업 전체 contactResearchStatus는 available을 유지한다. 기술 실패는 `status=failed` 및 error. retryable은 오류 특성이지 무제한 재시도 허가가 아니다. 재시도 실행 계약은 §0.2 제외 범위다.

**수동 연락처 등록 계약안 — P-19:** `POST /candidates/{id}/contact-endpoints`

요청: `{ expectedRevision, contactId, person, ownerType, channel, address, companyConfirmed:true, sourceUrl, confirmationNote }`. contactId 또는 새 사람 정보 `person:{name,role}` 중 하나만 전달한다. 공용 이메일은 둘 다 null. sourceUrl 또는 confirmationNote 중 하나 이상의 확인 근거가 필요하다. 개인 창구는 사람 필수이며, 공용 창구는 email만 허용한다.

서버는 인증 사용자·기업 소속·주소 형식·중복·revision을 검사한다. 성공 시 사람(신규인 경우)·endpoint·usable 평가와 확인자/서버 시각을 함께 저장하고 201 `{data:{person,channel,evaluation,candidate}}`를 반환한다. 등록자의 ID·시각은 클라이언트가 임의 지정하지 않는다. 중복 주소는 같은 기업의 기존 창구를 안내하는 409 응답으로 처리하며 자동 중복 생성을 하지 않는다. AI 승인 대기 단계를 만들지 않는다. 확인 근거 저장 세부 물리 모델은 기존 감사 이력을 재사용할 수 있다.

### 6.8 수신자·채널 선택과 분기 이동

**사용 맥락:** 사람이 특정 창구로 연락하기로 결정한다. P-09,10,16.

기존 `PUT /outreaches/{id}/recipient` 본문:

```json
{ "expectedVersion": 4, "contactId": "contact-1", "endpointId": "endpoint-1", "channel": "email" }
```

공용 이메일이면 contactId=null. endpoint가 같은 기업 소속이고 사람/채널과 일치하는지 검사한다. 사람을 선택했다는 이유만으로 채널을 서버가 대신 정하지 않는다. 선택이 바뀌면 version·selectionVersion을 증가시키고 이전 이메일 최종 확인 결과를 무효화한다. 기존 200 대협봇 상세 응답 구조는 유지한다. 읽기 모델의 selectedRecipient에 현재 선택이 반영돼야 한다.

`PATCH /outreaches/{id}/target-quarter` 본문: `{ "expectedVersion": 5, "targetQuarterId": "quarter-q1", "reason": null }`.

최초 성공 발송 이전의 작업만 이 범위에 해당한다. 분기 변경은 현재 작업과 감사 이력을 같은 트랜잭션에서 갱신한다. 진행·대기 중 발송이 있거나 발송 여부가 unknown이면 동시 변경으로 이력이 어긋나지 않도록 `409 INVALID_STATE`로 처리하는 구현 계약안이다. 성공 발송 이력이 있으면 `409 ALREADY_SENT`. 같은 분기 요청은 변화 없이 200. 응답 data는 `{outreachId,currentTargetQuarterId,version}`. 원발견 배치·분기는 유지한다.

### 6.9 공통 템플릿·초안 생성·수정

**사용 맥락:** 수신자 선택 전에도 기업별 초안을 만들고 상세에서 수정·재생성한다. P-11,12.

- 기존 `GET /template-bindings?route=new`는 templateId·templateVersion·requiredVariables 등 연결 정보를 조회한다. 원문 관리 API가 아니다. 공통 원본의 실제 채널 매핑은 §8에서 이관한다.
- `POST /outreaches/{id}/draft-generations`: `{ "expectedVersion": 5, "userInstruction": "제안을 간결하게 써줘", "expectedDraftRevision": 2 }`. userInstruction은 생략/null/빈 값 가능. 최초 생성이면 expectedDraftRevision=null.
- 202 `{data:{taskId,outreachId}}`. 작업은 `/tasks/{id}`로 조회하고 성공 결과의 draftRevision ID로 생성 버전을 식별한다. 수신자 미선택이면 수신자 변수를 placeholder로 보존한다.
- 실패 시 기존 초안을 유지한다. 생성 완료 시 요청 당시 초안·선택 버전과 충돌하면 사용자가 뒤에 수정한 내용을 조용히 덮어쓰지 않는다.
- 기존 `GET /drafts/{outreachId}`는 `outreachId`, `revision`, `topic`, `subject`, `body`, `approvedRevision`, `templateUsed`를 유지하고 필요한 generationInstruction·selectionVersion을 추가한다.
- 기존 `PATCH /drafts/{outreachId}`는 `{expectedVersion,expectedRevision,topic,subject,body}`를 받는다. 필수 구조는 기존 구현과 대조하고 subject/body는 공백만 허용하지 않는다. 새 revision을 저장하고 기존 200 상세 응답을 유지한다.
- `GET /outreaches/{id}/draft-revisions?limit=...&cursor=...`: revision 내림차순의 DraftRevision 목록. 실제 발송에 사용한 버전도 조회 가능하다.

프론트의 수정 모드·본문 펼침·수신자 반영 보기·복사 토스트는 클라이언트 상태다. 영속 `editing`, `copied` 업무 상태를 만들지 않는다. 미해결 변수가 남은 최종 메시지는 발송하지 않는다.

### 6.10 이메일 최종 확인과 명시적 항목 벌크 전송

**사용 맥락:** 사람이 이메일을 선택한 기업들의 실제 수신자·제목·본문을 보고 승인한다. P-13,17.

`POST /email-sends/preview` 본문:

```json
{
  "items": [
    { "outreachId": "outreach-1", "endpointId": "endpoint-1", "expectedVersion": 6, "expectedDraftRevision": 3 }
  ]
}
```

200 `{data:{items:[...]}}`. 각 항목은 `outreachId`, `endpointId`, `eligible`, `blockedReasons:string[]`, `to:string|null`, `recipientName:string|null`, `subject:string|null`, `body:string|null`, `selectionVersion:number|null`, `payloadHash:string|null`, `previewToken:string|null`, `expiresAt:datetime|null`. 허용된 항목에 최종 값과 토큰을 제공하고, 거절된 항목에는 이유를 제공한다. 이 응답은 목록 조회가 아닌 일괄 확인 작업의 결과라 page 봉투를 사용하지 않는다.

서버는 현재 선택·fit·창구 평가·초안 버전·미해결 변수를 확인한다. 이메일과 LinkedIn이 함께 존재해도 이메일 선택 건을 거절하지 않는다. 미리보기는 발송 기록을 만들지 않는다.

확인 뒤 `POST /email-sends/bulk`:

```json
{
  "items": [
    {
      "outreachId": "outreach-1",
      "endpointId": "endpoint-1",
      "expectedVersion": 6,
      "expectedDraftRevision": 3,
      "selectionVersion": 2,
      "payloadHash": "sha256:example",
      "previewToken": "opaque-token",
      "sendRequestKey": "stable-key-for-this-message"
    }
  ]
}
```

- 명시적으로 선택한 항목 배열만 처리한다. query 전체·전체 선택 플래그는 정의하지 않는다.
- 배치 전체 선택은 해당 배치의 현재 필터 결과 ID를 확보하여 구성한다. 클라이언트에 로딩된 첫 페이지만 선택하고 ‘배치 전체’로 표시해서는 안 된다. 다른 배치는 자동 포함하지 않는다. 페이지 사이에 결과가 변경되면 선택 당시의 명시적인 ID만 유지하며 신규 유입 기업을 자동 선택하지 않는다. 최종 발송 권한·적격성은 서버에서 재검증한다.
- 토큰은 사용자·작업·창구·내용·버전·만료를 서버에서 검증 가능한 방식으로 묶는다. hash만으로 발송 권한을 인정하지 않는다.
- 202 `{data:{items:[{outreachId,sendId,status,errorCode}],acceptedCount,rejectedCount}}`. 신규 행의 status는 queued/rejected, sendId·errorCode는 해당하지 않으면 null. 같은 메시지 키가 이미 존재하면 해당 sendId와 현재 SendStatus를 반환하며 새 발송을 만들지 않는다. 따라서 행 status의 전체 타입은 SendStatus 또는 rejected다. acceptedCount는 정상 접수 또는 기존 요청으로 확인된 항목 수이며 신규 발송 실적이 아니다. HTTP 멱등 재요청은 최초 응답을 재사용한다.
- 일부 거절/실패가 전체 성공을 뜻하지 않는다. 요청 형식 전체가 잘못되면 422, 행별 현재 상태 충돌은 해당 행을 rejected로 반환한다.
- 접수된 유효 메시지만 큐에 넣는다. 외부 호출 직전에도 발송에 필요한 현재 조건을 재검증한다. 승인한 내용이 달라졌으면 새 미리보기가 필요하다.
- 공급자 성공 확인 때 sent·sentAt을 기록한다. 이미 외부 전송이 시작된 결과 불명 상태는 unknown으로 두며, 확인 전 동일 메시지를 임의로 다시 보내지 않는다. 전송 성공은 수신·열람·답장을 보장하지 않는다.
- 이 계약은 최초 연락 작업에 적용한다. 성공 발송 뒤 다른 수신자에게 새 메시지를 보내는 권한은 이번 버전에서 정의하지 않는다.

### 6.11 LinkedIn 수동 발송 기록과 전송 이력

**사용 맥락:** 사람이 프로필을 열어 직접 보낸 뒤 완료 사실을 기록한다. P-14,15,17.

`POST /outreaches/{id}/manual-send-records`:

```json
{
  "expectedVersion": 6,
  "expectedDraftRevision": 3,
  "endpointId": "linkedin-endpoint-1",
  "channel": "linkedin",
  "actualMessageSnapshot": { "subject": "실제 보낸 제목", "body": "실제 보낸 본문" },
  "sentAt": "2026-09-26T03:00:00Z"
}
```

실제로 선택한 LinkedIn 창구·기업 소속·초안 참조를 검증한다. actualMessageSnapshot은 필수이며 복사 후 외부에서 수정했다면 실제 전송 내용으로 확인한다. sentAt은 생략 가능하고, 생략 시 사용자 확인 시각을 대용으로 기록한다. 구현 시 별도 `sentAtSource:userProvided/confirmationTime`을 추가해 시각의 출처를 보존한다. 서버의 recordedAt·확인 주체는 별도이며, 미래 시각 등 잘못된 입력은 거절한다.

201 `{data:{sendId,status:'sent',confirmationMethod:'linkedin_manual',confirmedByMemberId,sentAt,sentAtSource,recordedAt}}`. 이는 사용자의 확인이지 LinkedIn API가 전송을 검증했다는 뜻이 아니다. 복사 API는 업무 상태를 변경하지 않는다. 수동 기록의 sendRequestKey는 인증 사용자·작업·Idempotency-Key에서 서버가 안정적으로 도출한다. 같은 요청 키의 재전송은 같은 기록을 반환한다.

- 기존 `GET /sends/{sendId}`는 현재 snapshot 필드와 응답 봉투를 유지하고 필요한 `targetQuarterId`, `confirmationMethod`, `confirmedByMemberId`, `recordedAt`, `sentAtSource`, `providerMessageId`, `error` 등을 확장한다. sentAt은 미발송 상태에서 null이다.
- 신규 `GET /outreaches/{id}/sends?limit=...&cursor=...`는 SentMessage 목록. 조회 가능하다는 것이 추가 발송 허용을 의미하지 않는다.

### 6.12 분기 발송 지표

`GET /quarterly-send-metrics?year=2026&quarter=3`

200 `{data:{calendarQuarter:{year,quarter,timezone:'Asia/Seoul',startAt,endAtExclusive},sentMessages:{total,email,linkedin},calculatedAt}}`.

status=sent이고 sentAt이 `[startAt,endAtExclusive)`인 발송 이벤트 수다. 목표 분기·원발견 배치·초안·복사·대기/실패 건수로 계산하지 않는다. 달력 기간은 서버가 한국 시간 기준으로 구하고 UTC 경계로 조회한다. 목표 4분기 기업에 9월 발송했어도 3분기 실적이다.

### 6.13 오류와 클라이언트 대응

| HTTP / code | 의미 | 화면 처리 |
| --- | --- | --- |
| 401 UNAUTHENTICATED / 403 FORBIDDEN | 로그인·권한 문제 | 로그인·권한 안내 |
| 404 NOT_FOUND | 대상 없음 또는 접근 불가 | 상세 닫기/재조회 |
| 409 REVISION_CONFLICT | v0.1 조사 계열의 expectedRevision 불일치 | 최신 정보 재조회 후 변경 확인 |
| 409 VERSION_CONFLICT | 기존 대협봇 및 신규 Outreach 계열의 버전 불일치 | 최신 작업 상태 재조회. 사용자 변경 강제 덮어쓰기 금지 |
| 409 IDEMPOTENCY_CONFLICT | 같은 요청 키로 다른 내용 전달 | 통신 재시도는 원문 유지, 새로운 동작은 새 키 |
| 409 INVALID_STATE / FIT_REQUIRED / ALREADY_SENT | 현재 상태에서 요청 범위의 동작 불가 | 이유 표시하고 가능한 행동 재조회 |
| 409 PREVIEW_STALE | 최종 확인 이후 내용·선택 변경 또는 만료 | 이메일 최종 내용 다시 확인 |
| 409 ALREADY_EXISTS / TASK_ALREADY_RUNNING | 동일 분기 존재 또는 충돌하는 작업 진행 중 | 기존 리소스·작업 확인 |
| 422 VALIDATION_ERROR / UNSUPPORTED_SOURCE | 입력 오류·미지원 소스 | 해당 입력 오류 표시 |
| 429 RATE_LIMITED / 503 SERVICE_UNAVAILABLE | 요청 제한·서비스 일시 오류 | 제공된 Retry-After 준수. 접수된 작업은 ID로 조회 |

새 오류 코드는 현행 서버에 없을 수 있으므로 enum·HTTP 매핑·클라이언트 처리를 함께 구현한다. 오류 details에는 API 키·토큰·내부 비밀을 포함하지 않는다. 기존 오류 코드의 개명은 camelCase 전환 작업에 포함하지 않는다.

## 7. 구현 시 고려 사항과 프론트 반영

### 7.1 프론트 책임과 백엔드 책임

| 기능 | 프론트 | 백엔드 |
| --- | --- | --- |
| 후보 표시 | 기업/배치 보기, 펼침·접힘, 선택 UI | 동일 데이터 조회, 후보 조건 계산, 페이지네이션 |
| 판단 근거 | 출처 링크·확인일·AI/사람 판단 구분 | 보고서·출처·판단 이력과 현재 참조 제공 |
| 연락 선택 | 개인·공용 창구와 검증 상태 표시, 명시적 선택 | 소속·창구 평가·현재 버전·권한 확인 |
| 메시지 | 읽기/수정 모드, 수신자 반영 보기/해제 | 템플릿·초안 버전·최종 렌더링·충돌 검사 |
| 이메일 | 확인한 실제 내용 표시, 건별 상태 갱신 | 접수·중복 방지·공급자 전송·결과 기록 |
| LinkedIn | 실제 프로필 열기, 제목/본문 복사, 전송 내용 확인 | 사용자 확인 이벤트·시각·실제 메시지 저장 |
| 조사·생성 진행 | 상태·오류·기존 결과 표시 | 접수·진행·결과·오류 구분. 실행 정책은 별도 |

상태에 따라 버튼을 숨기는 것은 UI 편의다. 서버에서 허용 조건을 다시 검사해야 한다. 화면 상태를 그대로 DB 모델로 옮기거나 여러 테이블이라는 이유로 여러 페이지를 만들지 않는다.

### 7.2 배포된 목업과 v0.4 전체 계약의 차이

검토 대상은 `dhbot-admin-pr/apps/dh-frontend/src/listup`의 React 목업이며, 커밋 `4b2a326`을 기존 Vercel 주소에 배포했다(§0.3). 더 이상 ‘로컬 전용·미배포’ 상태가 아니다. 다만 API 계약 전체를 구현한 서비스는 아니며, 아래 표는 배포 목업에서 앞으로 보완할 항목을 구분한다. 예전 `listup-mockup` HTML은 현재 배포본이 아니다.

| 항목 | 현재 배포 목업 | v0.4 반영 작업 |
| --- | --- | --- |
| 통합 화면 | 기업/배치 보기, 전체 높이 오른쪽 상세 패널 | 유지 |
| 담당자·조건 | 팀원 A/B·팀장 권한 시연, 팀원 기본 ‘내 담당’·팀장 ‘전체’, 조건 null 가능 | 실제 로그인 사용자·서버 역할 및 API 입력 매핑 |
| 업무 권한 | 본인/팀장 변경 가능, 타인 조회 전용 UI 및 목업 변경 함수 가드 | 실제 보안은 서버 인증·인가·allowedActions로 구현. 목업 전환기를 실제 권한 부여 기능으로 사용하지 않음 |
| API 표기 | 내부 모델은 이미 camelCase | API DTO의 의미·응답 구조 매핑. 단순 철자 치환으로 끝내지 않음 |
| 연락 창구 | 사람 아래 email/linkedin 문자열 | 사람과 endpoint 분리, 공용 메일 선택, 평가·근거 표시 |
| 후보 편입 | fit + 연락 문자열 존재 | 서버 isActiveCandidate 및 판정 결과 사용 |
| 근거·판단 | 샘플 문장, 수정자·시각 | 출처·확인일·보고서·사람의 선택 사유·판단 이력 |
| 추가 조사 | 샘플 연락처 즉시 삽입 | queued/running/succeeded/failed 표시, 미발견 구분 |
| 초안 재생성 | 요청 문구를 본문에 덧붙임 | 생성 작업·새 버전·실패 시 기존 초안 유지 |
| 전송 | 이메일 즉시 성공 시뮬레이션, sent 한 개 | 건별 상태·실제 발송 snapshot·발송 목록 |
| LinkedIn | 프로필 버튼은 안내 토스트 | 실제 URL 열기, 실제 전송 내용·시각 확인 |
| 분기 이동 | 원배치 유지, 미발송 이동 | 서버 검증·동시성·이동 감사 이력 연결 |
| 다수 기업 | 샘플 배열을 20개씩 표시. 배치 헤더 체크는 해당 배치 전체를 즉시 선택/해제, 확장 안내 없음 | 운영에서는 커서 조회 필요. 20개는 표시 단위이며 조사 목표/한도 아님. 기업 보기 선택 확장은 검토안 |
| 재조사 필요 | 기존 boolean 후보 제외·선택 초기화 동작이 남아 있음 | 삭제 대상. 명시적 추가 조사 작업으로 전환하고 기존 유효 데이터·담당자·선택 유지 |
| 기존 전송 이력 | 기존 목업의 전송 완료 필터가 남아 있음 | 신규 목록에서 성공 전송·협업 이력 기업 제외. 후속 작업 페이지는 별도 제작 |
| 저장 | localStorage | mock 저장소와 API 접근 계층 분리. 샘플과 운영 데이터를 구분 |

배포 목업의 `quarter` 문자열은 서버의 `currentTargetQuarterId`와 목표 분기 표시 정보로 매핑한다. 신규 화면에 별도의 Cycle 선택·시작·종료 기능을 추가하지 않는다. `batchId`는 originSearchRunId, `personId`는 contactId, `sent` 단건은 전송 이력과 최신 상태로 매핑해야 한다. `ContactTask`라는 프론트 이름을 서버 조사 Task와 혼동하지 않도록 OutreachViewModel 등으로 분리하는 것을 권장한다.

### 7.3 수집·판단의 구현 경계

권장 구조는 **소스별 수집 → 공통 기업 식별 → 조사 보고서·근거 저장 → fit 판단 → 연락 조사 결과**다. 소스별로 완전히 다른 후보 모델을 만들지 않는다.

- 코드: 데이터 접근, ID·중복 확인, 형식 검사, 저장·큐 처리.
- LLM: 검색어 제안, 문서에서 정보 추출, 근거에 기반한 개입 가능성·가치 판단.
- 사람: 프로필 활동 판단, 수신자·채널 선택, fit 수정, LinkedIn 발송 확인.

Google·혁신의 숲·뉴스레터는 선택 가능한 소스의 예시이며 실제 연결 완료나 API 제공 여부를 보장하지 않는다. 선택 소스는 기업 발견에 적용하고, 발견 후 보완은 접근이 허용된 다른 출처를 사용할 수 있다. 각 소스의 접근 방법·수집기 구현과 반복·종료·비용 정책은 별도 실행 명세가 필요하다.

### 7.3.1 소스는 어떻게 등록하는가 — 현행과 구현 제안

**현행 확인:** 이 문서에는 탐색 요청의 `sources:{key,name,entryUrls,query}[]`와 서버의 지원 key 검사만 있었으며, 소스 등록 API/화면은 없다. 로컬 백엔드 `apps/dh-backend/src/config/searchOptions.ts`는 고정 sources 배열을 정의하고 `GET /search-options`에서 반환한다. 로컬 목업의 Google·뉴스레터·혁신의 숲 선택지는 하드코딩이며 실제 수집기 등록 또는 연동 완료를 뜻하지 않는다.

**구현 제안, 아직 확정 아님:** 초기는 개발자가 서버 소스 목록을 구성하고 사용자는 그 목록에서 선택하는 방식이 가능하다. 지원 수집기별 key·표시명·기본 진입 URL·활성 여부를 관리하고, 화면에는 선택 가능한 정보만 전달한다. API 키 같은 비밀은 사용자 선택 목록에 노출하지 않는다. 현행 문자열 배열을 객체 목록으로 확장하려면 GET /search-options 계약과 소비 화면을 함께 변경해야 하며, 이 변경 형태는 소스 관리 설계 시 확정한다.

등록은 다음 두 경우를 구분해야 한다.

| 경우 | 필요한 작업 | 단순 URL 등록만으로 가능한가 |
| --- | --- | --- |
| 이미 지원하는 뉴스레터/피드 수집기에 새 URL 추가 | 소스 이름·식별 key·진입 URL과 접근 가능 여부 확인 | 해당 형식과 접근을 수집기가 지원할 때 가능 |
| 새로운 기업 플랫폼/검색 제공자 추가 | 접근 방식·허용 범위 검토, 수집기/인증 연결, 추출·중복 식별 시험 | 불가능. 별도 구현 필요 |

`entryUrls`는 지원 소스에서 탐색할 진입점이지, 임의 사이트를 등록해 자동 수집기를 생성하는 기능이 아니다. URL을 서버에서 가져올 경우 허용 프로토콜·도메인/리다이렉트 검증과 내부 주소 접근 차단도 필요하다. 팀원이 직접 소스를 추가할 관리 화면·POST API가 필요한지는 §0.2에서 결정한다. 이번 변경으로 등록 기능이 구현된 것은 아니다.

### 7.4 동시성·조회·저장 구현

- fit 변경·수신자 선택·분기 이동·전송 접수는 버전 검사와 상태 변경을 같은 트랜잭션에서 수행한다. 메일 접수와 분기 이동이 동시에 승인되지 않도록 같은 작업을 기준으로 충돌을 검사한다.
- 초안의 각 버전과 실제 발송 내용은 보존한다. 현재 내용만 덮어써 과거 발송 증거가 바뀌지 않게 한다.
- JSON으로 보관한 claims·interventions는 버전 단위 읽기에 적합한 구현 제안이다. 내부 evidenceIds가 실제 FK는 아니므로 저장 시 기업·ID 일치를 검사한다.
- 분기·담당자·배치·기업별 조회 경로와 발송 시각 집계에 필요한 인덱스를 실제 쿼리 기준으로 설계한다. FK가 자동으로 조회용 인덱스를 생성한다고 가정하지 않는다.
- 커서는 정렬 필드와 ID를 함께 포함한다. 배치 내·기업 전체 보기의 필터·정렬이 일관돼야 한다. 최종 인덱스는 실제 조회 계획으로 검증한다.
- 신규 제약 적용 전 기존 null·중복·고아 참조를 확인한다. 문서의 목표 제약을 운영 DB에 바로 강제하지 않는다.

## 8. 기존 구현 연결·이관 — 제품 정책과 별도

### 8.1 확인 기준

백엔드·DB의 초기 대조 기준은 `b3f346149e671b5ee5dfbccf44d07582f1df867c`이며, 프론트 목업은 그 이후 `4b2a326b3fe8c6b1d94b03c72edd65cbbb978169`로 커밋·배포했다. 확인 자료는 `packages/db/schema.prisma`, `apps/dh-backend`의 기존 라우트·직렬화 코드, `apps/dh-frontend/src/listup`이다. 팀원이 별도로 구현한 최신 API나 운영 DB를 이 문서에서 검증 완료했다고 주장하지 않는다.

### 8.2 Cycle과 분기

신규 사용자는 목표 분기와 탐색 배치만 이해하면 된다. 기존 Cycle은 수동 시작·종료 및 과거 연락 관련 코드의 참조다. 새 분기의 추가 상위 개념으로 사용하지 않는다. 신규 입력에서 Cycle을 제외하는 것과 기존 DB의 Cycle 참조를 삭제하는 것은 별도 작업이다.

| 현재 참조 | 신규 흐름에서 필요한 처리 |
| --- | --- |
| `search_runs.cycle_id` 필수 | 신규 SearchRun은 targetQuarterId로 연결. 기존 FK의 nullable 전환 등은 참조 코드·기존 데이터·구버전 호환을 확인한 뒤 별도 이관 |
| `outreaches.current_cycle_id` 및 마지막/보류 차수 참조 | 신규 currentTargetQuarterId와 과거 차수 참조의 의미를 구분. 마지막 발송·보류 차수의 사용처와 후속 업무 영향을 검토한 뒤 이관 |
| `sent_messages.cycle_id` 필수 | 기존 발송 당시 차수 참조 보존. 신규 발송은 targetQuarterId와 sentAt을 구분하며 기존 FK 제약 전환은 별도 이관 |

단순히 cycleId 필드를 targetQuarterId로 개명하지 않는다. 과거 분기가 불명확하면 발송 시각만으로 ‘목표 분기’를 추정해 채우지 않는다. 과거 sentAt이 있으면 실제 달력 분기 지표는 목표 분기 없이도 집계할 수 있다. 물리 삭제·이관 범위는 코드 사용처를 확인해 별도 마이그레이션으로 처리한다.

### 8.3 camelCase 전환

| 이전 리스트업 필드 | v0.4 필드 | 의미 |
| --- | --- | --- |
| `target_quarter_id` | `targetQuarterId` | 목표 분기 |
| `search_run_id` | `searchRunId` | 배치 필터/참조. 원발견을 명시하는 읽기 필드는 originSearchRunId |
| `assigned_member_id` | `assignedMemberId` | 담당자 |
| `created_by` | `createdBy` | 생성 사용자 |
| `additional_conditions` | `additionalConditions` | 선택 관심 기업 조건 |
| `expected_revision` | `expectedRevision` | 조사 revision 충돌 확인 |
| `expected_version` | `expectedVersion` | 연락 작업 version 충돌 확인 |
| `expected_draft_revision` | `expectedDraftRevision` | 생성·발송에서 확인한 초안 버전 |
| `next_cursor`, `has_more` | `nextCursor`, `hasMore` | 목록 다음 페이지 |
| `request_id` | `requestId` | 요청 추적 |

camelCase가 목표 원칙이라는 사용자 결정을 반영했다. 기존 snake_case를 사용 중인 서버·클라이언트가 있으면 요청 DTO, 응답 직렬화, 테스트, 프론트 어댑터를 함께 전환한다. 같은 URL에서 어느 버전이 적용되는지 배포 단계에서 확인하고 구·신 필드를 무기한 혼용하지 않는다. 구형 입력의 임시 호환 기간을 둘지는 실제 클라이언트 목록을 기준으로 별도 전환 작업에서 정한다.

기존 enum 값과 오류 코드는 유지한다. 실제 구현이 본문과 다른 값을 사용 중이면 전환 전에 명시적으로 대조한다. DB enum을 자동 개명하지 않는다. v0.1 응답 봉투와 기존 대협봇 응답 봉투를 표기법 변경에 편승해 통합하지 않는다.

### 8.4 기존 모델·API의 구체적 차이

- 현재 기존 수신자 선택 라우트는 개인 연락처와 특정 workStage를 가정한다. 공용 메일·상세에서의 재선택 요구를 반영하되 기존 응답 구조는 유지한다.
- 현재 발송 조회는 sentAt이 있다고 가정한다. queued/failed/unknown과 null sentAt을 지원하도록 저장 모델·직렬화·이력 화면을 함께 수정한다.
- 기존 템플릿의 route×channel 구조는 신규 연락 공통 원본 요구와 매핑한다. 다른 route의 템플릿을 일괄 합치지 않는다.
- 기존 회사당 Outreach 유니크 구조를 반복 발송 정책의 결론으로 해석하지 않는다. 현재 최초 연락 범위의 작업은 재사용하고 향후 재접촉 정책을 별도 설계한다.
- v0.1 논리 모델과 실제 테이블의 존재 여부를 구분한다. 이미 있는 물리 모델에 같은 목적의 새 테이블을 중복 생성하지 않는다.

## 9. 변경 요약과 인수 검증

### 9.1 v0.3 대비 변경

| 구분 | v0.4의 변경 |
| --- | --- |
| 문서 구성 | 실제 사용 맥락 → 확정 정책 → 데이터·API → 프론트·이관 순으로 재구성 |
| API 원칙 | camelCase로 변경. DB 표기와 HTTP 표기 분리 |
| 분기·차수 | 신규 업무는 수주 목표 분기와 탐색 배치로 관리. 기존 Cycle은 신규 입력에서 제외하고 별도 이관 대상으로 구분 |
| 기업 조사 | 중복 기업 등록 방지와 조사 보고서 버전 분리. 평생 조사 횟수 제한 표현 제거 |
| 확정 사항 보강 | 시작자가 첫 전송까지 담당. 수동 확인 창구 사용 가능. 추가 조사 요청만으로 후보 제외·선택 초기화 없음. 자동 재검토 없음. 발견 소스와 보완 출처 구분 |
| 범위 분리 | 전송·협업 이력 기업은 별도 페이지. 신규 첫 연락 API의 후보 조회 의미 보정 |
| 선택·권한 추가 확정 | 배치 전체 선택에 확장 단계 없음. 팀원은 본인 업무 변경·타인 조회, 팀장은 전체 변경 |
| 남은 아젠다 | 조사 실행·종료·한도, 기업 보기 선택 범위, 소스 등록 관리 |
| 판단 근거 | AI 설명과 사람 이유를 구분하고 출처·확인 시각·버전 읽기 계약 보강 |
| 메시지·발송 | 초안 버전·발송 이력 조회 추가, 수동 발송 시각 출처 명시 |
| 프론트 인계 | 현 목업의 충족·보완·계약 제외 항목 명시 |

### 9.2 범위 안에서 검증할 시나리오

| 검증 | 기대 결과 | 정책 |
| --- | --- | --- |
| 조건 없이 새 탐색 입력 | targetQuarterId로 목표 분기 전달, additionalConditions=null, 탐색 이름·Cycle 입력 없음 | P-01~03 |
| 기업 보기와 배치 보기 전환 | 같은 companyId/outreachId, 후보 중복 생성 없음 | P-18 |
| 배치 전체 선택 후 다음 페이지 이동 | 같은 배치의 선택 유지. 다른 배치 자동 선택 없음, 별도 확장 단계 없음 | P-24 |
| 타인 업무를 팀원이 열기 | 근거·관계자·메시지 조회 가능, 수정·전송·완료 표시 불가, 서버도 거절 | P-23 |
| 팀장이 다른 팀원 업무 열기 | 수정·전송 가능, 원 담당자 유지, 행동 주체는 팀장으로 기록 | P-02,23 |
| 적합하지만 창구 미확보 | 조사 이력에서 조회 가능, 활성 후보 아님 | P-07 |
| 사람의 fit 수정 | AI 판단 보존, 사람 이유와 주체를 별도 표시 | P-05,06 |
| 명시적 추가 조사 완료 | 기존 보고서 보존, 새 버전 연결, 종료 배치 재개 없음 | P-08 |
| 기존 기업 재발견·분기 변경·시간 경과 | 자동 재조사 없음, 중복 신규 기업 없음 | P-08 |
| 추가 조사 요청·실패 | 담당자·기존 유효 수신자/채널 유지, 요청 자체로 후보 제외 없음 | P-02,22 |
| 사람이 기업 소속을 확인한 연락처 등록 | 형식·중복 검사 후 사용 가능, 확인 주체·시각·근거 보존 | P-19 |
| 발견 이후 보완에 다른 허용 출처 사용 | 새 근거 출처 기록, 발견 입력 스냅샷은 유지 | P-20 |
| 성공 전송·협업 이력 기업 조회 | 신규 후보 제외, 기존 이력 보존 | P-21 |
| 연락 조사 성공·미발견 | 기술 실패로 표시하지 않음 | P-07 |
| LinkedIn과 이메일 모두 존재 | 사람이 이메일 선택 가능, 선택 전 자동 전송 없음 | P-09,13 |
| 확인된 대표 메일 선택 | 사람 참조 null로 선택 가능 | P-10 |
| 초안 재생성 실패 | 이전 초안과 내용 유지 | P-12 |
| 확인 후 초안·수신자 변경 | 이전 이메일 preview로 발송 불가 | P-13 |
| 벌크 일부 실패 | 기업별 성공·실패가 구분됨 | P-13 |
| 같은 발송 요청 재전송 | 같은 sendId, 실적 중복 증가 없음 | P-17 |
| LinkedIn 복사만 수행 | 발송 기록·실적 변화 없음 | P-14 |
| LinkedIn 직접 발송 확인 | 사용자 확인 주체·실제 내용·시각 출처 기록 | P-14 |
| 4분기 목표 기업에 9월 발송 | 3분기 실적, 목표 분기 유지 | P-15 |
| 미발송 기업 목표 분기 이동 | 현재 목표 분기만 변경. 기업·원발견 배치·당시 목표 분기·담당자 및 이동 이력 보존 | P-16 |
| 발송 성공 이후 단순 분기 이동 | 신규 첫 연락으로 되돌리는 수단으로 처리하지 않음 | P-16,21 |

현재 로컬 `src/listup/model.test.ts`의 8개 테스트는 일부 후보·채널·판단·분기 계산과 담당자/팀장 권한을 검증한다. 이 표 전체나 실제 백엔드·발송 연동을 검증한 것은 아니다. 실행 정책이 빠진 조사 워커, 제외한 쓰기 기능, 실제 공급자 연결까지 완료됐다고 인계하지 않는다.

### 9.3 용어 풀이

- **스키마:** 무엇을 어떤 형태로 저장하고 연결할지 정한 규칙.
- **API:** 화면과 서버가 주고받는 요청·응답 및 행동의 약속.
- **FK:** 다른 데이터의 ID를 연결하고 참조가 존재하도록 보장하는 관계.
- **revision/version:** 오래된 화면의 변경이 최신 작업을 덮어쓰지 않도록 비교하는 번호.
- **스냅샷:** 당시 검색 조건·메시지 내용을 이후 변경과 분리해 보존한 값.
- **멱등성:** 같은 요청을 다시 보내도 같은 작업·발송이 중복 생성되지 않는 성질.
- **cursor:** 목록의 다음 구간을 읽기 위해 서버가 발급하는 위치 표시.
- **이관:** 기존 데이터와 코드를 새 구조에 맞추되 과거 의미와 기록을 보존하는 작업.
