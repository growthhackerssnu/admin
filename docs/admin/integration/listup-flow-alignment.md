# 리스트업 화면과 백엔드 흐름 정합성

## 현재 화면 흐름

조사 결과 → 적합·사용 가능한 연락처 확인 → 컨택 시작 → 수신자·채널 선택 → 메시지 생성 → 초안 편집·승인 → 발송 준비.

| 사용자 행동 | 대응 API | 조건 / 결과 |
| --- | --- | --- |
| 컨택 시작 | POST /candidates/:id/outreaches | 적합 + usableContactCount > 0, recipient_selection |
| 수신자·채널 선택 | PUT /outreaches/:id/recipient | recipient_selection에서만 가능 |
| 메시지 생성 | POST /outreaches/:id/draft-generation | 선택한 수신자·채널 필수, draft_review로 이동 |
| 초안 수정 | PATCH /drafts/:id | 기존 승인 해제, draft_review |
| 기존 초안 검토 | POST /outreaches/:id/draft-review | 재생성 없이 기존 본문 검토, draft_review |
| 초안 승인 | POST /drafts/:id/approval | 현재 초안 버전 승인, ready_to_send |
| 수신자 변경·재생성 | POST /outreaches/:id/recipient-review | 기존 초안 보존, 승인 해제, recipient_selection으로 복귀 |

프론트는 아직 샘플 데이터와 localStorage로 위 순서를 시연한다. 실 API 호출·인증·동시성 제어 연동 완료를 뜻하지 않는다. 샘플의 연락처 유무는 사용 가능 연락처를 대신하며 실제 연동에서는 서버 usableCount 및 연락처 평가를 사용해야 한다.

## Freeze 변경

- F-14: 모든 대상에서 연락처 조사로 이어지는 대신, 유효 적합성 판단이 적합인 대상만 이어진다. 사람의 중간 승인은 없다.
- F-16: 적합·연락처 확보 후 명시적 컨택 시작, 수신자·채널 선택 후 생성, 생성한 초안의 승인을 추가한다.
- F-17: 위 순서에 맞춰 발송 행동을 정리한다. 별도 기업 승인 화면은 없다.

## 남은 API 연결 지점

- 발송 결과 저장 쓰기 API가 현재 구현되어 있지 않다. 화면의 완료 저장은 비활성화하고 기존 기록은 보존한다. F-19의 실제 전송 후 기록 원칙은 유지한다.
- 연락하지 않음·팀 전체 버리기의 저장 API는 별도 확인·구현이 필요하다. F-18의 업무 구분은 유지한다.
- 생성 API에는 자유형 재생성 요청 입력이 없다. 화면에서 해당 입력을 제거하고 수신자 재검토 후 명시적으로 다시 생성한다.
- 탐색 UI는 Google 검색어 필수, 조사 수 1~30, 혁신의 숲 비활성 조건을 적용한다. 수치·소스 가용성은 구현 설정이며 freeze에 고정하지 않는다.
