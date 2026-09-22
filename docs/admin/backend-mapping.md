# 과거 코드와 연결할 지점 — 역사적 참고 자료

PR #3 이후 기존 구현을 제거하고 새 기반에서 개발하기로 했다. 아래는 제거 전 검토 기록이며 현재 저장소에 해당 모델·워크플로우는 없다. 재사용이나 기존 프레임워크 유지 요구사항이 아니다.

검토 기준: main `3444fec26576cad0852ca906a74dd291879e4883` (2026-09-22 확인). 이후 백엔드 변경이 있으면 재확인한다. 아래 내용은 연결 제안이며 스키마 변경 요청이나 구현 완료 명세가 아니다.

이 문서는 어드민 전환 이전(Slack 봇 시절) `prisma/schema.prisma` 기준으로 작성됐다. 지금 어드민 화면 기준의 테이블 설계는 [integration/05_데이터 모델 제안.md](integration/05_데이터%20모델%20제안.md)을 참고한다. 이 문서는 옛 스키마와의 재사용 가능성을 검토할 때만 참고한다.

## 기존 구조

- [Prisma 모델](https://github.com/growthhackerssnu/dhbot/blob/3444fec26576cad0852ca906a74dd291879e4883/prisma/schema.prisma): Company, RunCompany, Contact, ContactMethod, Evidence, MessageDraft 등.
- [Slack 처리](https://github.com/growthhackerssnu/dhbot/blob/3444fec26576cad0852ca906a74dd291879e4883/src/slack/app.ts): 사용자의 기업·관계자 결정 수신.
- [수집 워크플로우](https://github.com/growthhackerssnu/dhbot/blob/3444fec26576cad0852ca906a74dd291879e4883/src/workflows/outreach-run.ts): 조사, 승인 대기, 관계자 조사, 초안 작성.
- [구현 설명](https://github.com/growthhackerssnu/dhbot/blob/3444fec26576cad0852ca906a74dd291879e4883/docs/IMPLEMENTATION.md): 모듈별 실제 동작과 남은 작업.

## 재사용 후보와 차이

| 어드민 개념 | 기존 모델·코드 | 연결 전 확인 |
|---|---|---|
| 기업·조사 근거 | Company, Evidence | 제품·내부 담당자·현재 경로를 어떤 조회 결과로 조합할지 |
| 수주 차수 | WorkflowRun, WorkflowConfig | Run은 실행 1회. 차수와 같지 않음. 한 차수의 여러 실행 관계 필요 |
| 이번 컨택 건 | RunCompany | 실행별 기업 후보와 차수별 컨택 건이 같은 단위인지 검토. 일대일 대응 가정 금지 |
| 기업 승인·제외 | CompanyDecision, CooldownClass | 내부 검토 결과와 외부 기업의 거절 응답 분리. 날짜 cooldown과 다음 차수 복귀 차이 |
| 수신자 | Contact, ContactMethod, ContactCandidate, ContactDecision | 후보와 실제 사람 구분, 동일인·배포 전 접촉자 제외, 발송 주소 선택 |
| 메시지 | MessageDraft | 경로별 지정 템플릿, 승인 버전, 발송 당시 스냅샷의 보존 방식 |
| 응답 기록 | ReplyDraft, ReplyIntent, reply 모듈 | 자동 의도 분류·답장 초안과 사람이 저장하는 응답 결과는 별개 |
| 조사 작업 | Inngest 워크플로우 | 웹이 조회할 작업 상태와 실패·재개 규격 |
| 실제 발송 | 기존 README는 직접 외부 발송하지 않음 | 목업의 시뮬레이션을 운영 발송 완료로 취급하지 않음 |
| 수주 확정·Notion | 기존 Notion 연동 코드·설명 | 최종 결과 관리와 양방향 동기화가 구현됐다고 가정하지 않음 |

## 웹 승인도 워크플로우를 재개해야 한다

현재 Slack은 `dhbot/company.decision.batch`, `dhbot/contact.decision.batch` 이벤트를 보내고, outreach-run은 해당 이벤트를 기다린다. 웹에서 DB 상태만 바꾸면 대기 중인 작업이 재개되지 않을 수 있다.

제안: 권한·상태 검증 → 결정과 이력 저장 → 기존 흐름에 맞는 이벤트 전달을 공유 업무 함수로 분리하고 Slack과 웹에서 호출한다. 이벤트 payload와 run 연결, 중복 처리, 저장 성공 후 이벤트 전달 실패 복구는 백엔드 담당자와 합의한다. 기존 배치 승인과 목업의 기업별 승인을 어떻게 연결할지도 확인한다.

## 구현 범위 순서

1. 차수·컨택 건·상태 의미와 웹 인증 합의.
2. 기존 모델을 이용한 목록·상세·이력 조회.
3. 검토·수신자·응답·초안 저장과 공유 승인 로직 연결.
4. 탐색·생성 작업의 웹 상태 조회.
5. 발송 범위 및 수주 결과 관리는 별도 결정 후 구현.

위 순서는 기존 코드 재사용을 전제로 했던 과거 제안이다. 새 구현은 프레임워크·경로·작업 엔진을 독립적으로 결정한다. 연동 문서의 어댑터 함수 이름은 실제 API가 아니며 HTTP/서버 함수 등 전송 방식도 미확정이다.
