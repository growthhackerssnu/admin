# dhbot

Growth Hackers 산학협력 대외협력 봇 — 산학협력(프로젝트 수주) 대상 기업을 발굴하고, 담당자를 찾아 개인화된
아웃리치 메시지 초안을 준비하는 Slack 기반 리서치 보조 도구.

기업 승인, 담당자 선택, 프로젝트 제안 작성, 최종 메시지 발송은 항상 사람이 직접 수행한다. 이 봇은 리서치와
초안 작성까지만 자동화하며, 어떤 메시지도 외부로 직접 전송하지 않는다.

전체 아키텍처/설계 결정/비용 추정은 프로젝트 계획서를 참고할 것 (Growth Hackers 산학협력 대외협력 봇 구현 계획).

## 기술 스택

- Next.js (App Router API + Pages API, UI 페이지 없음 — Slack 인터랙션이 유일한 인터페이스)
- Slack Bolt (`@slack/bolt`) — Block Kit 승인 카드, 슬래시 커맨드
- Inngest — 승인 대기 등 수시간~수일 정지/재개가 필요한 durable workflow
- Prisma + Supabase(Postgres)
- Anthropic Claude API — 기업 적합도 평가, 담당자 발굴, 메시지 초안 생성, 내장 web_search 도구로 LinkedIn 우회 검색(스니펫만 사용, 직접 스크래핑 금지)
- Notion API — 프로젝트 목록 참조, 미팅/수주 관리
- Google Sheets API — 주기적 이력 백업

## 로컬 개발 환경 설정

```bash
npm install
cp .env.example .env.local   # 값을 채운다 (아래 "필요한 계정/키" 참고)
npx prisma migrate dev       # DB 스키마 생성
```

터미널 3개를 열어 동시에 실행:

```bash
npm run dev                              # Next.js dev 서버 (localhost:3000)
npx inngest-cli dev -u http://localhost:3000/api/inngest   # Inngest Dev Server (localhost:8288)
```

Slack에서 로컬 서버로 이벤트를 받으려면 ngrok 등으로 `localhost:3000`을 터널링하고,
Slack App 설정의 Request URL을 `https://<ngrok-domain>/api/slack/events`로 지정한다.

### Slack 없이 durable workflow만 먼저 확인하기 (Phase 1 검증)

```bash
npm run dev:seed
```

더미 `WorkflowRun`과 기업 후보 2건을 생성한 뒤, 출력된 이벤트를 Inngest Dev Server
대시보드(http://localhost:8288)에서 직접 보내면 `outreach-run` 워크플로우가 시작되고
Slack 승인 채널에 카드가 게시된다. 버튼을 누르지 않고 며칠 방치했을 때 타임아웃되는지,
버튼을 누르면 그 지점부터 정확히 재개되는지를 이 단계에서 확인한다.

## 필요한 계정/키 (학회 명의로 신규 가입 필요)

| 서비스 | 용도 |
|---|---|
| Vercel | 호스팅 |
| Supabase | Postgres DB |
| Inngest | durable workflow 오케스트레이션 |
| Anthropic (Claude API) | LLM 리서치/초안 생성 |
| Slack App | 승인/선택/초안 검토 인터페이스 |
| Notion Integration | 프로젝트 목록 참조, 미팅/수주 관리 |
| Google Cloud (Sheets API) | 이력 백업 |

## 디렉토리 구조

```
app/api/inngest/route.ts       — Inngest 서버리스 핸들러
app/api/slack/events/route.ts  — Slack 이벤트/액션/커맨드/모달 웹훅 (@vercel/slack-bolt)
src/workflows/                 — Inngest durable workflow (파이프라인 단계 오케스트레이션)
src/slack/                     — Slack Bolt 앱, Block Kit/모달 빌더
src/modules/                   — 소싱/담당자발굴/초안생성/답장/재조사 등 비즈니스 로직
src/config/ttl.ts              — EVIDENCE 필드별 재사용 TTL 정책
src/lib/                       — Prisma/Anthropic/Notion 등 외부 클라이언트 wiring
src/dev/                       — 로컬 테스트용 더미 데이터 시더
prisma/schema.prisma           — 데이터 모델 (ERD 기반)
```

## Slack 커맨드

| 커맨드 | 용도 |
|---|---|
| `/dhbot-run` | 실제 소싱 파이프라인 실행 (뉴스 피드 수집 → 후보 평가 → 승인 카드) |
| `/dhbot-reply` | 받은 답장 원문을 붙여넣어 의도 분류 + 답신 초안 생성 |
| `/dhbot-rescan` | 쿨다운이 끝난 과거 후보 즉시 재조사 (평소엔 매달 1일 자동 실행) |
| `/dhbot-run-test` | 더미 데이터로 durable workflow만 검증(Phase 1 테스트용) |

## 빌드 단계 (현재 진행 상황)

- [x] **Phase 0**: 스키마, Slack App 스켈레톤, Inngest+Next.js 배포 골격, 환경변수 정리
- [x] **Phase 1**: 더미 데이터로 DB+Slack 승인 루프, durable workflow(`step.waitForEvent`) 검증
- [x] **Phase 2**: 실제 소싱 파이프라인(규칙기반 필터+RSS 커넥터+Claude web_search 평가+dedup+cooldown 게이팅)
- [x] **Phase 3**: 담당자 발굴+승인 게이트 2 (Evidence 근거 기록, EXCEPTION_QUEUE)
- [x] **Phase 4**: 초안 생성+Notion 프로젝트 목록 참조+Slack 모달 인간 편집 핸드오프
- [x] **Phase 5-1**: 답장 초안 생성 (의도 분류 + 답신 초안, `/dhbot-reply`)
- [x] **Phase 5-2**: 잊혀진 기업 재조사 (쿨다운 만료 후보 재평가, `/dhbot-rescan` + 월간 cron)

남은 TODO(담당자 재조사 루프, 거절 사유 분류 모달, Notion 미팅 관리 DB 기록, Google Sheets 백업)는 별도 관리 중.
