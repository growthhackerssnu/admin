# dhbot 구현 문서

이 문서는 dhbot이 실제로 어떻게 만들어져 있는지, 각 기능이 어떤 로직으로 동작하는지 정리한다. PRD와 계획서에 있는 의도를 실제 코드가 어떻게 구현했는지 확인할 때 참고하는 용도다.

## 1. 이 프로젝트가 하는 일

dhbot은 서울대 비즈니스 데이터 학회 Growth Hackers가 산학협력 대상 기업을 찾고, 담당자를 발굴하고, 아웃리치 메시지 초안을 준비하는 과정을 돕는 Slack 봇이다.

봇이 자동으로 하는 일은 리서치와 초안 작성까지다. 기업을 최종 승인하는 것, 담당자를 최종 선택하는 것, 프로젝트 제안 내용을 쓰는 것, 완성된 메시지를 실제로 보내는 것은 항상 사람이 한다. 봇은 메시지를 외부로 직접 전송하는 기능을 갖고 있지 않다.

## 2. 기술 스택과 그 이유

- 언어: TypeScript, Next.js (App Router)
- 호스팅: Vercel
- 데이터베이스: Supabase의 Postgres, Prisma로 접근
- 워크플로우 오케스트레이션: Inngest
- Slack 연동: `@slack/bolt`와 `@vercel/slack-bolt`
- LLM: Anthropic Claude API (`claude-sonnet-5` 모델, 내장 `web_search` 도구 사용)
- Notion 연동: `@notionhq/client`
- Google Sheets 연동: `googleapis`

Slack 승인을 최대 3일까지 기다려야 하는 지점이 여러 번 있다. Vercel의 서버리스 함수는 한 번의 HTTP 요청 처리 시간에 제한이 있어서, 이렇게 오래 기다리는 로직을 직접 구현하기 어렵다. Inngest는 이 문제를 해결해준다. `step.waitForEvent`를 쓰면 함수 실행이 멈춘 상태로 저장되고, 나중에 정해진 이벤트가 들어오면 그 지점부터 정확히 이어서 실행된다. 이 프로젝트에서 가장 중요한 인프라 결정이었다.

Claude의 `web_search` 도구는 링크드인 프로필을 직접 크롤링하지 않고, 검색 스니펫만으로 담당자 정보를 찾기 위해 쓴다. 원래 계획에는 Google Custom Search API를 쓸 예정이었으나, 이 API가 2025년에 신규 가입이 막히고 2027년 1월 1일에 완전히 종료된다는 사실이 확인되어 채택하지 않았다.

## 3. 배포 및 필요 계정

레포지토리는 `https://github.com/growthhackerssnu/dhbot`이고, 배포 주소는 `https://dhbot.vercel.app`이다.

다음 계정이 필요하다.

| 서비스 | 용도 |
|---|---|
| Vercel | 호스팅 |
| Supabase | Postgres 데이터베이스 |
| Inngest | 워크플로우 오케스트레이션 |
| Anthropic | Claude API |
| Slack | 봇 앱, 슬래시 커맨드 |
| Notion | 프로젝트 목록 참조, 미팅 관리 (미팅 관리 쓰기는 아직 구현 안 됨) |
| Google Cloud | Sheets API 서비스 계정 |

환경변수 목록과 설명은 레포 루트의 `.env.example`에 정리되어 있다.

## 4. 데이터 모델

데이터 모델은 `prisma/schema.prisma`에 정의되어 있다. 표 하나로 정리하면 다음과 같다.

| 테이블 | 역할 |
|---|---|
| WorkflowConfig | 반복 사용하는 검색 조건 (업종, 투자 단계, 임직원 수, 목표 기업 수, 재조사 한도) |
| WorkflowRun | 워크플로우 한 번의 실행 |
| Company | 기업의 기본 정보 |
| RunCompany | 특정 실행에서 평가된 기업 (적합도, 추천 이유, 상태) |
| CompanyDecision | 기업 승인/거절 기록 (거절 사유, 쿨다운 분류) |
| ResearchAttempt | 담당자 발굴 시도 기록 (몇 번째 시도인지 포함) |
| Evidence | 조사 결과의 근거 (출처, 신뢰도) |
| Contact | 담당자 기본 정보 |
| ContactCandidate | 특정 실행에서 추천된 담당자 (역할, 적합도, 상태) |
| ContactMethod | 담당자의 연락 수단 |
| ContactDecision | 담당자 선택/거절 기록 |
| MessageDraft | 아웃리치 메시지 초안 (버전별로 새 행이 생김) |
| ReplyDraft | 받은 답장에 대한 의도 분류와 답신 초안 |
| ExceptionQueue | 사람이 직접 판단해야 하는 예외 건 |
| SourceFeed | 소싱에 쓰는 RSS 피드 목록 |

ERD에 원래 없었지만 추가한 필드와 테이블은 다음과 같다.

- `Company.aliases`, `Company.status`: 회사 이름이 바뀌거나 폐업한 경우를 추적하기 위함
- `CompanyDecision.cooldownClass`, `CompanyDecision.cooldownUntil`: 거절된 기업을 나중에 다시 검토할지 여부를 관리하기 위함
- `RunCompany`에 `(runId, companyId)` 조합의 유니크 제약: 같은 실행 안에서 같은 기업이 중복 등록되는 것을 막기 위함
- `ExceptionQueue` 테이블: 사람이 직접 판단해야 하는 건을 조회 가능한 형태로 관리하기 위함
- `SourceFeed` 테이블: 소싱 출처를 코드에 하드코딩하지 않고 데이터베이스에서 관리하기 위함
- `ReplyDraft` 테이블: 답장 초안 기능을 위해 추가

## 5. 전체 워크플로우

핵심 로직은 `src/workflows/outreach-run.ts`에 있는 `outreachRun`이라는 Inngest 함수 하나에 다 들어있다. 이 함수는 `dhbot/run.sourcing.requested` 이벤트가 오면 시작된다.

### 5.1 기업 소싱

먼저 이 실행에 이미 `RunCompany`가 채워져 있는지 확인한다. 채워져 있지 않으면 `src/modules/sourcing/pipeline.ts`의 `runSourcingPipeline`을 호출한다.

이 함수가 하는 일은 다음과 같은 순서다.

1. `SourceFeed` 테이블에서 활성화된 RSS 피드를 읽어온다. 지금 등록된 피드는 플래텀과 아웃스탠딩이다.
2. `src/modules/sourcing/sourceFeeds.ts`의 `collectRawCandidates`가 각 피드를 파싱해서 기사 제목을 가져온다.
3. `src/modules/sourcing/ruleBasedExtract.ts`의 `extractCompanyNameCandidate`가 규칙 기반으로 회사명처럼 보이는 부분을 뽑아낸다. 이 단계는 Claude를 호출하지 않고, 명백히 회사명이 아닌 것(인터뷰, 채용공고 등 특정 단어가 들어간 제목, 구분자가 없는 제목)을 미리 걸러내서 이후 단계에서 낭비되는 API 호출을 줄이는 역할을 한다.
4. 걸러진 후보 하나하나에 대해 `src/modules/sourcing/evaluateCandidate.ts`의 `evaluateCandidate`를 호출한다. 이 함수는 Claude에게 `web_search` 도구를 주고, 이 후보가 실제 회사가 맞는지, 도메인이 무엇인지, 업종과 투자 단계와 임직원 수는 어떤지, `WorkflowConfig`의 조건과 얼마나 맞는지를 조사하게 한다. 정보를 찾지 못하면 추측하지 말고 `uncertainty` 필드에 남기고 `fitScore`를 낮추도록 프롬프트에 명시했다. 규칙 기반 추출이 회사명을 잘못 뽑았을 경우를 대비해, Claude가 web_search로 확인한 정확한 회사명(`companyName` 필드)도 같이 받아서 이걸 우선 사용한다.

    이때 `web_search`는 열린 웹 전체가 아니라 `src/modules/sourcing/searchScope.ts`의 화이트리스트 안에서만 검색한다. 한국 스타트업 DB(혁신의숲, THE VC, 넥스트유니콘, 로켓펀치), 채용 플랫폼, 스타트업 전문 매체, 공공 기업정보 사이트가 등록되어 있고, 여기에 그 후보가 나온 출처 기사의 도메인이 호출 시점에 자동으로 더해진다. `SourceFeed`에 새 매체를 추가해도 화이트리스트를 고칠 필요가 없게 하기 위함이다.

    범위를 고정한 이유는, 제한된 `max_uses` 안에서 블로그나 홍보성 글에 검색 횟수를 소모해 정작 필요한 투자 단계와 임직원 수를 못 채운 채 끝나는 경우가 많았기 때문이다. 소싱에 필요한 사실은 대부분 위 네 부류 안에서 확인된다.

    다만 회사 공식 홈페이지는 후보마다 달라서 화이트리스트에 넣을 수 없다. 그래서 스타트업 DB의 기업 프로필에 적힌 홈페이지 주소를 읽어 도메인을 확인하도록 프롬프트에 지시하고, 그래도 "실존하는 회사는 맞는데 도메인을 못 찾은" 결과가 나온 경우에만 범위 제한 없이 한 번 더 검색한다. 도메인은 `Company`의 유니크 키이자 쿨다운 게이팅의 기준이라, 비어 있으면 후보가 통째로 버려지기 때문이다. 반대로 화이트리스트 안에서 "회사가 아니다"라는 결론이 난 경우는 재검색하지 않는다. 그 판단의 1차 근거인 출처 기사는 항상 탐색 범위에 포함되어 이미 읽은 상태이기 때문이다.
5. 도메인이 확인된 후보는 `src/modules/sourcing/cooldownGate.ts`의 `checkCooldownGate`로 다시 검토 대상이 될 자격이 있는지 확인한다. 영구 제외된 기업, 아직 쿨다운 기간 중인 기업, 다른 실행에서 이미 진행 중인 기업은 여기서 제외된다.
6. 남은 후보를 `fitScore` 순으로 정렬해서 목표 기업 수의 3배까지 골라 `Company`와 `RunCompany`를 만든다.

후보 평가 하나하나는 Inngest의 `step.run`으로 개별 단계로 나눠져 있다. Claude에 `web_search`를 여러 번 요청하면 시간이 걸리는데, 이걸 한 단계로 묶어서 처리하면 Vercel 서버리스 함수 한 번 호출의 실행 시간 제한(60초로 설정)을 넘길 수 있기 때문이다. 이렇게 나눠두면 Inngest가 각 단계를 별도의 함수 호출로 처리해서 이 문제를 피할 수 있다.

후보가 하나도 안 남으면 `WorkflowRun` 상태를 `FAILED`로 바꾸고, Slack에 후보를 찾지 못했다는 메시지를 보낸 뒤 실행을 끝낸다.

### 5.2 기업 승인 (첫 번째 승인 단계)

`src/slack/blocks/companyApprovalCard.ts`의 `postCompanyApprovalCards`가 각 기업 후보를 카드로 게시한다. 카드에는 적합도, 추천 이유, 불확실한 점이 표시되고 승인/거절 버튼이 붙는다.

승인 버튼을 누르면 즉시 `RunCompany` 상태가 `APPROVED`로 바뀌고 `CompanyDecision`이 기록된다.

거절 버튼을 누르면 곧바로 기록하지 않고 모달을 연다. 이 모달(`src/slack/blocks/companyRejectModal.ts`)은 거절 사유를 두 가지 중 하나로 고르게 한다.

- 조건 자체가 안 맞음: `cooldownClass`를 `PERMANENT_DISQUALIFY`로 기록한다. 이 기업은 이후 소싱이나 재조사에서 다시는 후보로 올라오지 않는다.
- 타이밍이나 여력 문제: `cooldownClass`를 `COOLDOWN_ELIGIBLE`로 기록하고, `cooldownUntil`을 현재로부터 30일 뒤로 설정한다. 이 기간이 지나면 5.7절에서 설명하는 잊혀진 기업 재조사 대상이 될 수 있다.

상세 사유를 적는 자유 서술 칸도 있고, 이 값은 `CompanyDecision.rejectionReason`에 저장된다.

모든 카드를 다 검토하면 "검토 완료" 버튼을 누른다. 이 버튼은 `dhbot/company.decision.batch` 이벤트를 발행한다. `outreachRun` 함수는 `step.waitForEvent`로 이 이벤트를 최대 3일간 기다리고 있다가, 이벤트가 오면 그 지점부터 이어서 실행된다. 3일이 지나도 오지 않으면 실행을 `FAILED`로 종료하고 Slack에 알린다.

승인된 기업이 하나도 없으면 여기서 `WorkflowRun`을 `COMPLETED`로 바꾸고 실행을 끝낸다. 승인된 기업이 있으면 다음 단계로 넘어간다.

### 5.3 담당자 발굴과 재조사 루프 (두 번째 승인 단계)

승인된 기업마다 `src/modules/contacts/persistContacts.ts`의 `researchAndPersistContacts`를 호출한다. 이 함수는 `src/modules/contacts/discoverContacts.ts`의 `discoverContacts`를 통해 Claude에게 다음 세 가지 역할에 해당하는 사람을 한 명씩 찾게 한다.

- 의사결정권자: 대표, 임원 등 최종 결정권이 있는 사람
- 실무자: 실제로 프로젝트를 수행할 사람
- 챔피언: 사내에서 이 제안을 지지해줄 가능성이 높은 사람

프롬프트에는 링크드인 프로필 페이지를 직접 열어보지 말고 `web_search` 검색 결과에 나온 스니펫만 사용하라는 제약이 명시되어 있다. 이메일 주소도 확실한 근거 없이 지어내지 말라고 명시했다. 찾은 정보는 `Contact`, `ContactCandidate`, `ContactMethod`, `Evidence`로 저장된다.

담당자 후보 카드는 `src/slack/blocks/contactApprovalCard.ts`의 `postContactApprovalCards`가 게시한다. 각 후보에 선택/제외 버튼이 붙고, 클릭하면 `ContactCandidate` 상태와 `ContactDecision`이 즉시 기록된다.

"검토 완료" 버튼은 `dhbot/contact.decision.batch` 이벤트를 발행한다.

이벤트가 오면 각 기업마다 선택된 담당자가 있는지 확인한다.

- 한 명이라도 선택됐으면 `RunCompany` 상태를 `CONTACTS_READY`로 바꾼다.
- 한 명도 선택되지 않았으면, 그 기업에 대해 지금까지 몇 번 담당자를 조사했는지 `WorkflowConfig.contactRetryLimit`와 비교한다. 한도 안이면 그 기업만 다시 조사 대상에 넣고 다음 라운드로 넘긴다. 한도를 넘겼으면 `RunCompany` 상태를 `EXCEPTION`으로 바꾸고 `ExceptionQueue`에 기록한다.

이 과정은 하나도 선택되지 않은 기업이 없어질 때까지, 또는 모두 한도를 넘겨서 예외 처리될 때까지 반복된다. `outreach-run.ts` 안에서 while 루프로 구현되어 있고, 라운드마다 스텝 이름에 라운드 번호를 붙여서 (`discover-contacts-{id}-r{round}` 같은 식) 각 라운드를 구분한다.

재조사할 때는 이전 라운드에서 이미 제안했다가 거절된 사람을 다시 추천하지 않도록, `discoverContacts` 호출에 이전 후보 이름 목록을 `excludeNames`로 넘긴다.

Inngest의 `step.run`은 함수가 성공적으로 끝나야 그 결과가 저장되고, 실패하면 처음부터 다시 실행된다. 이 성질 때문에 `researchAndPersistContacts`는 매번 새로 조사하는 대신, 해당 라운드 번호로 이미 성공한 조사 기록이 있으면 그 결과를 그대로 재사용하도록 만들어져 있다. 그렇지 않으면 Vercel 함수가 타임아웃될 때마다 같은 라운드를 중복으로 조사하게 되어 Claude API 호출 비용이 낭비된다.

3일 안에 담당자 결정이 제출되지 않으면 그 라운드에서 실행을 `FAILED`로 종료하고 Slack에 알린다.

### 5.4 메시지 초안 생성과 사람의 편집

담당자가 선택된 기업이 하나도 없으면 `WorkflowRun`을 `COMPLETED`로 바꾸고 끝낸다. 있으면 선택된 담당자마다 `src/modules/drafting/persistDraft.ts`의 `createDraftForContactCandidate`를 호출한다.

이 함수는 `src/modules/drafting/generateDraft.ts`의 `generateDraftSkeleton`을 통해 Claude에게 다음 세 가지를 쓰게 한다.

- 사전조사 요약
- 문제 가설 (이 회사가 가질 법한 문제나 기회에 대한 추측)
- 메시지 본문

메시지 본문 안에서 실제 프로젝트 제안이 들어갈 자리에는 실제 내용 대신 정해진 자리표시자 문자열을 그대로 넣도록 프롬프트에 명시했다(`src/modules/drafting/generateDraft.ts`의 `PROPOSAL_PLACEHOLDER` 상수). 이 자리는 봇이 채우지 않는다.

이때 `src/lib/notion.ts`의 `getProjectListReference`가 Notion의 프로젝트 목록 데이터베이스를 읽어서 최근 프로젝트 제목 몇 개와 데이터베이스 링크를 가져온다. 이건 사람이 제안을 쓸 때 참고하라고 보여주는 용도이고, 봇이 이 목록을 보고 대신 제안을 쓰지는 않는다.

만들어진 초안은 `MessageDraft`로 저장되고 (버전 1, 상태 `AWAITING_PROPOSAL`), `src/slack/blocks/messageDraftCard.ts`의 `postDraftSkeletonCard`가 Slack에 게시한다. 카드에는 "프로젝트 제안 작성/수정" 버튼이 있다.

이 버튼을 누르면 모달이 열린다. 모달에는 Notion 프로젝트 목록 링크와, 제안 내용을 적는 칸이 있다. 제출하면 원래 초안의 자리표시자 문자열을 실제로 적은 제안 내용으로 바꿔서 새 버전의 `MessageDraft`를 만들고 (상태 `FINALIZED`), 완성된 메시지를 Slack 채널에 다시 올린다. 사람은 이 메시지를 복사해서 직접 보낸다. 봇은 여기서 할 일을 마친다.

### 5.5 답장 초안 생성

담당자에게서 답장이 오면, 사람이 `/dhbot-reply` 슬래시 커맨드를 입력한다. 이메일함과 연동하지 않고, 답장 원문을 사람이 직접 복사해서 붙여넣는 방식이다.

이 커맨드는 모달을 연다. 모달에는 회사명 또는 담당자 이름을 적는 칸과 답장 원문을 적는 칸이 있다.

Slack의 `trigger_id`는 슬래시 커맨드가 눌린 시점부터 3초 안에 모달을 열어야 유효하다. 이 모달을 만들 때 원래는 최근 발송된 대상 목록을 데이터베이스에서 미리 조회해서 드롭다운으로 보여주려고 했으나, 조회하는 동안 3초를 넘겨서 `expired_trigger_id` 오류가 나는 문제가 실제로 발생했다. 그래서 데이터베이스 조회 없이 텍스트 입력만으로 모달을 즉시 열고, 제출된 텍스트로 대상을 찾는 방식(`src/modules/reply/persistReply.ts`의 `findOutreachTargetsByQuery`)으로 바꿨다. 이 함수는 회사명이나 담당자명에 입력한 텍스트가 포함된 발송 완료 기록을 찾는다.

대상을 찾으면 `src/modules/reply/generateReply.ts`의 `classifyAndDraftReply`가 답장 원문을 다음 여섯 가지 중 하나로 분류한다.

- INTERESTED: 관심을 보이며 다음 단계를 원함
- NEEDS_INFO: 추가 정보를 요청함
- DECLINED: 거절함
- OUT_OF_OFFICE: 부재중 자동응답 등 본인이 쓴 답장이 아님
- WRONG_PERSON: 담당자가 아니라며 다른 사람을 안내함
- OTHER: 위 어디에도 속하지 않음

분류와 함께 그 의도에 맞는 답신 초안도 같이 만든다. 결과는 `ReplyDraft`로 저장되고 Slack 채널에 게시된다. 사람이 검토한 뒤 직접 보낸다.

### 5.6 기업 거절 사유와 재조사의 관계

5.2절에서 설명한 거절 사유 분류가 이 기능의 기반이다. `cooldownClass`가 `COOLDOWN_ELIGIBLE`이고 `cooldownUntil`이 지난 기업만 다시 검토 대상이 될 수 있다.

`src/modules/rescan/findForgottenCompanies.ts`의 `findForgottenCompanies`가 이런 기업을 찾는다. 과거에 `COOLDOWN_ELIGIBLE`로 거절된 적이 있는 기업을 먼저 데이터베이스에서 조회하고, 각각에 대해 5.1절에서 설명한 `checkCooldownGate`를 다시 적용해서 지금 시점에도 정말 자격이 있는지 확인한다. 영구 제외된 기업, 아직 쿨다운 중인 기업, 다른 실행에서 진행 중인 기업은 여기서도 제외된다.

자격이 있는 기업은 `src/modules/rescan/pipeline.ts`의 `runForgottenCompanyRescan`이 다시 `evaluateCandidate`로 재평가한다. 이 재평가가 동시에 최신 상태 확인 역할도 한다. 회사가 없어졌거나 사업 방향이 바뀌었다면 `web_search`를 통해 이 사실이 드러나게 되어 있다.

재평가를 통과한 기업은 새 `WorkflowRun`을 만들어서 `RunCompany`로 등록한다. 이렇게 만들어진 실행은 `dhbot/run.sourcing.requested` 이벤트로 `outreachRun` 함수에 넘겨진다. `RunCompany`가 이미 채워져 있기 때문에 5.1절의 소싱 단계는 건너뛰고 바로 5.2절의 승인 단계부터 시작한다. 이 덕분에 재조사 기능을 위해 승인, 담당자 발굴, 초안 생성 로직을 따로 만들 필요가 없었다.

이 재조사는 매달 1일 자정(한국 시간)에 자동으로 실행되고, `/dhbot-rescan` 커맨드로 언제든 수동으로도 실행할 수 있다.

### 5.7 이력 백업

`src/modules/backup/exportHistory.ts`의 `exportHistoryToSheets`가 `RunCompany`와 관련된 `Company`, 최근 `CompanyDecision`을 모두 읽어서 Google Sheets의 "이력"이라는 이름의 탭에 쓴다.

매번 기존 내용을 전부 지우고 새로 쓴다. 이전에 어디까지 백업했는지 추적하는 로직 없이, 항상 데이터베이스의 현재 상태와 정확히 일치하게 만드는 방식이다. 이 정도 규모(수십에서 수백 행)에서는 증분 방식보다 이게 더 단순하고 안전하다고 판단했다.

시트에 "이력" 탭이 없으면 자동으로 만든다. 이 백업은 매일 새벽 3시(한국 시간)에 자동으로 실행되고, `/dhbot-backup` 커맨드로 수동으로도 실행할 수 있다.

## 6. 실행이 조용히 끝나지 않도록 한 처리

다음 상황들은 전부 `WorkflowRun` 상태만 바꾸고 끝나는 게 아니라, Slack 채널에 무슨 일이 있었는지 알리는 메시지를 남기도록 되어 있다. 그렇지 않으면 사람이 봇이 아직 일하고 있는지, 이미 끝났는데 못 보고 있는 건지 알 수 없기 때문이다.

- 소싱 결과 조건에 맞는 기업 후보가 하나도 없을 때
- 기업 승인 대기가 3일을 넘겨 타임아웃될 때
- 담당자 승인 대기가 3일을 넘겨 타임아웃될 때
- 잊혀진 기업 재조사에서 재평가를 통과한 기업이 하나도 없을 때

이 부분들도 승인이나 거절과 동일하게, 사람이 결과를 놓치지 않도록 항상 결과를 알려주는 것을 원칙으로 한다.

## 7. Slack 슬래시 커맨드

| 커맨드 | 하는 일 |
|---|---|
| `/dhbot-run` | 실제 소싱 파이프라인을 실행한다. 빈 `WorkflowRun`만 만들고 이벤트를 보내면, `outreachRun` 함수가 소싱부터 시작한다. |
| `/dhbot-run-test` | 더미 데이터로 `WorkflowRun`과 `RunCompany`를 미리 채워서 실제 소싱 없이 durable workflow 동작만 확인할 때 쓴다. |
| `/dhbot-reply` | 받은 답장 원문을 붙여넣어 의도 분류와 답신 초안을 만든다. |
| `/dhbot-rescan` | 잊혀진 기업 재조사를 즉시 실행한다. 평소에는 매달 1일 자동 실행된다. |
| `/dhbot-backup` | Google Sheets 이력 백업을 즉시 실행한다. 평소에는 매일 새벽 자동 실행된다. |

## 8. 알려진 제한사항

다음은 원래 계획에 있었지만 아직 만들지 않은 기능이다.

- Notion의 미팅 관리 데이터베이스에 아무것도 쓰지 않는다. 계획대로라면 사람이 Slack에서 미팅이 성사됐다고 확인했을 때만 기록해야 하고, 답장이 INTERESTED로 분류됐다고 자동으로 기록해서는 안 된다.
- 담당자 재조사에서 이전에 제안했던 사람은 제외하지만, 링크드인 활동성 같은 지표는 애초에 API 없이는 확인할 수 없어서 인터뷰나 블로그 같은 공개 활동 흔적으로 대신 판단한다. 이 방식의 정확도는 검증되지 않았다.

## 9. 로컬 개발

로컬 개발 방법과 필요한 환경변수 설명은 레포 루트의 `README.md`에 있다.
