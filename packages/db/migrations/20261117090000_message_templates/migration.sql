-- 사람 검토 경로의 메일 양식을 코드에서 DB로 옮긴다. 기존 데이터는 지우거나 고치지 않는다.

-- CreateEnum
CREATE TYPE "dh"."MessageTemplateKind" AS ENUM ('new', 'recontact', 'repeat_collaboration');

-- AlterTable
ALTER TABLE "core"."people_directory" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "dh"."message_draft_revisions" ADD COLUMN     "message_template_version_id" TEXT;

-- CreateTable
CREATE TABLE "dh"."message_templates" (
    "id" TEXT NOT NULL,
    "kind" "dh"."MessageTemplateKind" NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."message_template_versions" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ai_instructions" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_key_key" ON "dh"."message_templates"("key");

-- CreateIndex
CREATE INDEX "message_templates_kind_sort_order_idx" ON "dh"."message_templates"("kind", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "message_template_versions_template_id_version_key" ON "dh"."message_template_versions"("template_id", "version");

-- AddForeignKey
ALTER TABLE "dh"."message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_message_template_version_id_fkey" FOREIGN KEY ("message_template_version_id") REFERENCES "dh"."message_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."message_template_versions" ADD CONSTRAINT "message_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "dh"."message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."message_template_versions" ADD CONSTRAINT "message_template_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 새 표는 RLS를 켜고 anon/authenticated 권한을 회수한다(conventions.md 9.1). 접근은 백엔드의 Postgres 연결로만 한다.
ALTER TABLE "dh"."message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."message_template_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "dh"."message_templates" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."message_template_versions" FROM anon, authenticated;

-- 초기 양식. 재수주는 내용 없이 칸만 만든다(current_version 0). 팀장이 설정 화면에서 채운다.
INSERT INTO "dh"."message_templates" ("id", "kind", "key", "name", "sort_order", "current_version", "updated_at") VALUES
  ('mt_new_default', 'new', 'new_default', '신규 발굴 기본', 0, 1, CURRENT_TIMESTAMP),
  ('mt_recontact_no_reply', 'recontact', 'recontact_no_reply', '답이 없었던 기업', 0, 1, CURRENT_TIMESTAMP),
  ('mt_recontact_discussed', 'recontact', 'recontact_discussed', '논의했지만 진행하지 못한 기업', 1, 1, CURRENT_TIMESTAMP),
  ('mt_recontact_follow_up', 'recontact', 'recontact_follow_up', '다시 논의하기로 한 기업', 2, 1, CURRENT_TIMESTAMP),
  ('mt_repeat_default', 'repeat_collaboration', 'repeat_default', '재수주 기본', 0, 0, CURRENT_TIMESTAMP);

INSERT INTO "dh"."message_template_versions" ("id", "template_id", "version", "subject", "body", "ai_instructions") VALUES
('mtv_new_default_1', 'mt_new_default', 1,
$t$[데이터 분석/모델링 산학협력 제안] 서울대학교 비즈니스 데이터 분석 학회 Growth Hackers와 {{기업명}}의 산학협력 프로젝트를 제안드립니다$t$,
$t$안녕하세요, {{수신자 호칭}}

서울대학교 경영대학 소속 비즈니스 데이터 분석 학회 Growth Hackers 대외협력팀장 {{팀장 이름}}입니다.

저희 Growth Hackers는 데이터 기반 의사결정을 통해 기업의 비즈니스 가치 창출을 도모하는 학회입니다. {{AI:협업 기업 예시}} 등 다양한 산업군의 기업들과 협력하며, 기업 문제 해결을 위한 데이터 분석 및 모델링 프로젝트를 진행하고 있습니다.

Growth Hackers에서 오는 {{프로젝트 기간}}에 진행될 산학협력프로젝트를 {{기업명(와/과)}} 함께하고자 협업을 제안드립니다. {{AI:제안 동기}}하여, {{수신자 지칭}}께 연락드리게 되었습니다. 제품의 문제 정의 및 현 시점의 과제에 기반하여, 데이터 분석을 통한 전략 제안 및 실행(Data Analysis) 혹은 모델링(Data Science) 프로젝트를 함께 진행하고자 합니다.

예를 들어,
{{AI:주제 아이디어}}
와 같은 프로젝트를 함께 고민해볼 수 있을 것이라 생각합니다.

사전 미팅을 통해 기업 상황에 적합한 프로젝트 주제를 상세 협의하며, 비즈니스 및 데이터 모델링에 역량을 가진 경영/산업공학/인공지능 관련 전공 등의 학회원들이 프로젝트를 수행하고 있습니다. 지난 해에 협업한 다수의 기업이 재진행 제안을 주셨으며, 정량적 비즈니스 임팩트와 함께 후속 인턴십 연계로도 활발히 이어질 만큼 높은 수준의 리소스 투입과 성과를 이어오고 있습니다.

저희 Growth Hackers에서 진행한 최근 프로젝트는 아래와 같습니다.
1) 더브이씨: LLM 기반 R&D 과제 및 기업 정보 요약 파이프라인 설계
2) 슈퍼센트: 하이브리드 캐쥬얼 게임의 플레이 흐름 기반 유저 광고 수익 최적화
3) 코인원: 유저 세그멘테이션 및 마르코프 체인 분석과 BERT4REC을 통한 리텐션 예측 모델 구성
4) 원셀프월드: 유저 세그멘테이션 기반 리텐션 전환 전략 제시

프로젝트 진행 시, 예상 타임라인은 아래와 같습니다. (변동 가능)
1. 참여 인원 확정 및 킥오프 미팅: {{킥오프 일정}}
2. 중간 발표: {{중간 발표 일정}}
3. 최종 발표: {{최종 발표 일정}}

현재는 {{프로젝트 기간}} 프로젝트를 우선적으로 제안드리고 있으나 데이터 적재 및 프로젝트 준비, 팀 배정 등 제반 상황에 따라 차기 {{차기 기간}} 일정으로 협의를 이어갈 수도 있습니다.

Growth Hackers 과거 프로젝트에 관한 상세 내용과 협업 방식을 포함한 소개서를 함께 송부드립니다. 앞선 주제 이외에도 현재 내부적으로 고려하고 계신 데이터 관련 과제가 있으시거나 궁금하신 점이 있으시면, 본 메시지나 아래 연락처 통해 회신 주시면 상세히 답변드리겠습니다.

감사합니다.

Growth Hackers 대외협력팀장 {{팀장 이름}} 드림

메일: {{학회 메일}}
전화: {{팀장 전화번호}}$t$,
$j${"협업 기업 예시":"과거 프로젝트 목록에 있는 기업 가운데 이 회사의 도메인과 가까운 곳 2~3개의 이름만 쉼표로 이어 쓴다. 목록에 없는 기업은 쓰지 않는다. 예: NH투자증권, 강남언니, 슈퍼센트","제안 동기":"조사 내용에서 확인된 이 회사의 도메인, 서비스, 최근 변화를 근거로 왜 이 회사에 제안하는지 한 문장으로 쓴다. 바로 뒤에 '하여,'가 붙으므로 '~에 주목'처럼 명사로 끝낸다.","주제 아이디어":"두 달 안에 끝낼 수 있는 데이터 분석 또는 모델링 프로젝트 주제를 정확히 3개 제안한다. 한 줄에 하나씩 쓰고 각 줄은 '- '로 시작한다."}$j$::jsonb),

('mtv_recontact_no_reply_1', 'mt_recontact_no_reply', 1,
$t$[데이터 분석/모델링 산학협력 제안] 서울대학교 비즈니스 데이터 분석 학회 Growth Hackers와 {{기업명}}의 산학협력 프로젝트를 제안드립니다$t$,
$t$안녕하세요, {{수신자 호칭}}

서울대학교 경영대학 소속 비즈니스 데이터 분석 학회 Growth Hackers 대외협력팀장 {{팀장 이름}}입니다.

저희 Growth Hackers는 데이터 기반 의사결정을 통해 기업의 비즈니스 가치 창출을 도모하는 학회입니다.

{{입력:이전 연락 시점}} 한 차례 연락을 드린 적이 있었는데, 당시에는 인연이 닿지 못해 아쉬웠습니다.

이후 Growth Hackers는 {{AI:협업 기업 예시}} 등과의 프로젝트를 통해 추천 시스템·A/B 테스트·LTV 분석 등 실제 서비스 개선 중심의 산학협력을 다수 진행해왔습니다.

Growth Hackers에서 오는 {{프로젝트 기간}}에 진행될 산학협력프로젝트를 {{기업명(와/과)}} 함께하고자 협업을 제안드립니다. {{AI:제안 동기}}하여, {{수신자 지칭}}께 연락드리게 되었습니다. 제품의 문제 정의 및 현 시점의 과제에 기반하여, 데이터 분석을 통한 전략 제안 및 실행(Data Analysis) 혹은 모델링(Data Science) 프로젝트를 함께 진행하고자 합니다.

예를 들어,
{{AI:주제 아이디어}}
와 같은 프로젝트를 함께 고민해볼 수 있을 것이라 생각합니다.

사전 미팅을 통해 기업 상황에 적합한 프로젝트 주제를 상세 협의하며, 비즈니스 및 데이터 모델링에 역량을 가진 경영/산업공학/인공지능 관련 전공 등의 학회원들이 프로젝트를 수행하고 있습니다. 지난 해에 협업한 다수의 기업이 재진행 제안을 주셨으며, 정량적 비즈니스 임팩트와 함께 후속 인턴십 연계로도 활발히 이어질 만큼 높은 수준의 리소스 투입과 성과를 이어오고 있습니다.

저희 Growth Hackers에서 진행한 최근 프로젝트는 아래와 같습니다.
1) NH투자증권: 초기 이용자 7일간 행동패턴 유형화 및 콘텐츠의 이용패턴 및 거래 재방문 전환 경로 분석
2) 슈퍼센트: 하이브리드 캐쥬얼 게임의 광고 및 인앱 수익화 분리 전략 제언
3) 볼라: 수집품 경매 라이브 추천 시스템 개발 및 고도화
4) 스캐터랩: 제타(어플리케이션) 내 홈 추천 시스템 고도화

프로젝트 진행 시, 예상 타임라인은 아래와 같습니다. (변동 가능)
1. 참여 인원 확정 및 킥오프 미팅: {{킥오프 일정}}
2. 중간 발표: {{중간 발표 일정}}
3. 최종 발표: {{최종 발표 일정}}

Growth Hackers 과거 프로젝트에 관한 상세 내용과 협업 방식을 포함한 소개서를 함께 송부드립니다. 앞선 주제 이외에도 현재 내부적으로 고려하고 계신 데이터 관련 과제가 있으시거나 궁금하신 점이 있으시면, 본 메시지나 아래 연락처 통해 회신 주시면 상세히 답변드리겠습니다.

감사합니다.

Growth Hackers 대외협력팀장 {{팀장 이름}} 드림

메일: {{학회 메일}}
전화: {{팀장 전화번호}}$t$,
$j${"협업 기업 예시":"과거 프로젝트 목록에 있는 기업 가운데 이 회사의 도메인과 가까운 곳 2~3개의 이름만 쉼표로 이어 쓴다. 목록에 없는 기업은 쓰지 않는다. 예: NH투자증권, 강남언니, 슈퍼센트","제안 동기":"조사 내용과 이전 연락 기록에서 확인된 이 회사의 도메인, 서비스, 최근 변화를 근거로 왜 이 회사에 다시 제안하는지 한 문장으로 쓴다. 바로 뒤에 '하여,'가 붙으므로 '~에 주목'처럼 명사로 끝낸다.","주제 아이디어":"두 달 안에 끝낼 수 있는 데이터 분석 또는 모델링 프로젝트 주제를 정확히 3개 제안한다. 한 줄에 하나씩 쓰고 각 줄은 '- '로 시작한다."}$j$::jsonb),

('mtv_recontact_discussed_1', 'mt_recontact_discussed', 1,
$t$[서울대학교 Growth Hackers] 산학협력 논의 관련$t$,
$t$안녕하세요, {{수신자 호칭}}

서울대학교 비즈니스 데이터 분석 학회 Growth Hackers 대외협력팀장 {{팀장 이름}}입니다.

저희 Growth Hackers {{입력:이전 팀장 이름}} 전 대외협력팀장님 이후 처음 인사드립니다. {{입력:이전 논의 시점}}에 저희 학회와 산학협력프로젝트 논의를 진행해주셨던 것으로 압니다. 당시 {{기업명}} 측 {{입력:진행하지 못한 사유}} 산학협력프로젝트 진행이 어려웠던 것 같습니다.

다름이 아니라, 저희 학회에서 예정된 {{프로젝트 기간}} 산학협력프로젝트 진행을 제안드리고자 연락드리게 되었습니다. 이전 논의 이후 서비스에도 많은 성장이 있었을 것으로 이해하고 있습니다. 관련하여 저희 Growth Hackers에서 오는 {{목표 분기}}에 맡아서 진행할 수 있는 프로젝트가 있다면 협력해보면 좋겠습니다. 현재 학회 내부적으로 {{AI:관심 도메인}} 도메인에 대한 높은 니즈와 관심이 있어, {{기업명}} 측에서 Data Analysis 및 Data Science 관련하여 산학협력을 진행할 주제가 있을지 검토해주시면 감사하겠습니다.

학회에서 진행한 주요 프로젝트 주제와 최근 프로젝트 간략히 소개드리며, 자세한 프로젝트 내용 및 현재 활동 기수 경력사항을 포함한 저희 학회 소개 자료를 함께 송부드립니다.

1. 주요 주제

1) Data Analysis 계열
- 유저 리텐션, 전환율, LTV 등 주요 지표 개선: Segmentation/Clustering, KBF 분석, CRM 및 가격 정책 개선, Funnel 분석
- AB TEST 설계 및 실행

2) Data Science 계열
- 추천시스템 설계: 커머스/컨텐츠 등 다수 도메인의 추천시스템 구축
- 피쳐 예측 및 분류 모델 설계: 유저 구매 전환/이탈 모델링, 수요 예측 등
- 자연어 처리(NLP): LLM 기반 정보 추출, 맞춤 NER, 컨텐츠 분류 등
- 컴퓨터 비전(CV): 이미지 분류/클러스터링 등

2. 최근 프로젝트

1) S-OIL: 통계/시계열 모델 기반 미래 소매경질유 수요 시나리오별 예측치 도출 / 모델링 분석 기반 S/S 전략적 요충지 선별 및 지역별 주유소 네트워크 최적화 전략 제언
2) 데이블: 클릭 예측 딥러닝 모델과 LP 모델의 적절한 Blending 방식 도출 / On-offine 지표의 misalign 원인 분석
3) 밸런스히어로: 승인자 클러스터링 및 거절자 연체율 예측 / Rejection Code 조건 후보군 스코어링하여 최종 Rejection Code 조건 제시
4) 모드하우스: CRM 액션 설계 및 실행 및 유저 세그먼트 세분화 / 캠페인 전환 기준 및 성과 분석 방식 정립
5) 커넥팅: 커넥팅 서비스의 10개 AB Test 결과 심층 분석 / 유저 세그먼트별 매출 및 리텐션 증대 전략 제시
6) 블리몽키즈: 배송 시뮬레이션 기반 최적 신규 물류창고 입지 전략 수립 / 브랜드 및 상품 단위 주문 데이터 분석을 통한 물류 전략 제언

Growth Hackers 과거 프로젝트에 관한 상세 내용과 협업 방식을 포함한 소개서를 함께 송부드립니다. 앞선 주제 이외에도 현재 내부적으로 고려하고 계신 데이터 관련 과제가 있으시거나 궁금하신 점이 있으시면, 본 메시지나 아래 연락처 통해 회신 주시면 상세히 답변드리겠습니다.

감사합니다.

Growth Hackers 대외협력팀장 {{팀장 이름}} 드림

메일: {{학회 메일}}
전화: {{팀장 전화번호}}$t$,
$j${"관심 도메인":"이 회사의 산업 도메인을 한두 단어로 쓴다. 예: 핀테크, 커머스"}$j$::jsonb),

('mtv_recontact_follow_up_1', 'mt_recontact_follow_up', 1,
$t$[서울대학교 Growth Hackers] 산학협력 논의 관련$t$,
$t$안녕하세요, {{수신자 호칭}}

서울대학교 비즈니스 데이터 분석 학회 Growth Hackers 대외협력팀장 {{팀장 이름}}입니다.

{{입력:이전 팀장 이름}} 전 대외협력팀장님이 연락드린 이후 처음 인사드립니다. {{입력:이전 논의 시점}}에 저희 학회와 산학협력프로젝트 논의를 진행해주셨던 것으로 기억합니다. 당시 저희 그로스해커스의 {{입력:당시 마감된 프로젝트 시기}} 타겟 프로젝트 수주가 마감되면서, 산학협력프로젝트 진행을 {{입력:다시 논의하기로 한 시기}}에 이어 논의하기로 했었는데요.

이에 저희 학회에서 예정된 {{프로젝트 기간}} 산학협력프로젝트 진행을 제안드리고자 연락드리게 되었습니다. 저번에 말씀 주셨던 것처럼, {{입력:예전 컨택 내용}}에 대한 니즈가 있는 것으로 기억하고 있습니다. 관련하여 저희 Growth Hackers에서 오는 {{목표 분기}}에 맡아서 진행할 수 있는 프로젝트가 있다면 협력해보면 좋겠습니다. 가능하시다면, 대면 혹은 비대면 미팅을 통해 협업 포인트를 찾아봐도 좋을 듯 합니다.

추가로 Growth Hackers의 최신화된 학회 소개서도 함께 송부드립니다. 혹시 추가로 궁금하신 점이 있다면, 본 메일이나 아래 연락처 통해 회신 주시면 상세히 답변드리겠습니다.

감사합니다.

Growth Hackers 대외협력팀장 {{팀장 이름}} 드림

메일: {{학회 메일}}
전화: {{팀장 전화번호}}$t$,
'{}'::jsonb);
