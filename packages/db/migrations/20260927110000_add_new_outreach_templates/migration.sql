-- New-company outreach only. Older active templates remain as inactive history.
UPDATE "dh"."templates"
SET "active" = false
WHERE "route" = 'new' AND "channel" IN ('email', 'linkedin') AND "active" = true;

INSERT INTO "dh"."templates" (
  "id", "route", "channel", "version", "subject_template", "body_template", "active"
)
VALUES
  (
    'new-outreach-email-v1',
    'new',
    'email',
    1,
    $$[데이터 분석/모델링 산학협력 제안] 서울대학교 비즈니스 데이터 분석 학회 Growth Hackers와 {{companyName}}의 산학협력 프로젝트를 제안드립니다$$,
    $$안녕하세요, {{recipientGreeting}}

서울대학교 경영대학 소속 비즈니스 데이터 분석 학회 Growth Hackers 대외협력팀장 여재욱입니다.

저희 Growth Hackers는 데이터 기반 의사결정을 통해 기업의 비즈니스 가치 창출을 도모하는 학회입니다. {{collaborationExamples}} 산업군의 기업들과 협력하며, 기업 문제 해결을 위한 데이터 분석 및 모델링 프로젝트를 진행하고 있습니다.

Growth Hackers에서 오는 2026년 10-12월에 진행될 산학협력프로젝트를 {{companyWithWaGwa}} 함께하고자 협업을 제안드립니다. {{motivation}}하여, {{recipientReference}}께 연락드리게 되었습니다. 제품의 문제 정의 및 현 시점의 과제에 기반하여, 데이터 분석을 통한 전략 제안 및 실행(Data Analysis) 혹은 모델링(Data Science) 프로젝트를 함께 진행하고자 합니다.

예를 들어,
{{projectIdeas}}
와 같은 프로젝트를 함께 고민해볼 수 있을 것이라 생각합니다.

사전 미팅을 통해 기업 상황에 적합한 프로젝트 주제를 상세 협의하며, 비즈니스 및 데이터 모델링에 역량을 가진 경영/산업공학/인공지능 관련 전공 등의 학회원들이 프로젝트를 수행하고 있습니다. 지난 해에 협업한 다수의 기업이 재진행 제안을 주셨으며, 정량적 비즈니스 임팩트와 함께 후속 인턴십 연계로도 활발히 이어질 만큼 높은 수준의 리소스 투입과 성과를 이어오고 있습니다.

저희 Growth Hackers에서 진행한 최근 프로젝트는 아래와 같습니다.
1. 더브이씨: LLM 기반 R&D 과제 및 기업 정보 요약 파이프라인 설계
2. 슈퍼센트: 하이브리드 캐주얼 게임의 플레이 흐름 기반 유저 광고 수익 최적화
3. 코인원: 유저 세그멘테이션 및 마르코프 체인 분석과 BERT4REC을 통한 리텐션 예측 모델 구성
4. 원셀프월드: 유저 세그멘테이션 기반 리텐션 전환 전략 제시

프로젝트 진행 시, 예상 타임라인은 아래와 같습니다. (변동 가능)
1. 참여 인원 확정 및 킥오프 미팅: 9월 4주차~9월 5주차
2. 중간 발표: 11월 1-2주차
3. 최종 발표: 12월 3~4주차

현재는 10~12월 프로젝트를 우선적으로 제안드리고 있으나 데이터 적재 및 프로젝트 준비, 팀 배정 등 제반 상황에 따라 차기 1~2월 일정으로 협의를 이어갈 수도 있습니다.

Growth Hackers 과거 프로젝트에 관한 상세 내용과 협업 방식을 포함한 소개서를 함께 송부드립니다. 앞선 주제 이외에도 현재 내부적으로 고려하고 계신 데이터 관련 과제가 있으시거나 궁금하신 점이 있으시면, 본 메시지나 아래 연락처 통해 회신 주시면 상세히 답변드리겠습니다.

감사합니다.

Growth Hackers 대외협력팀장 여재욱 드림

메일: contact@ghsnu.com
전화: 010-4757-3987$$,
    true
  ),
  (
    'new-outreach-linkedin-v1',
    'new',
    'linkedin',
    1,
    $$[데이터 분석/모델링 산학협력 제안] 서울대학교 비즈니스 데이터 분석 학회 Growth Hackers와 {{companyName}}의 산학협력 프로젝트를 제안드립니다$$,
    $$안녕하세요, {{recipientGreeting}}

서울대학교 경영대학 소속 비즈니스 데이터 분석 학회 Growth Hackers 대외협력팀장 여재욱입니다.

저희 Growth Hackers는 데이터 기반 의사결정을 통해 기업의 비즈니스 가치 창출을 도모하는 학회입니다. {{collaborationExamples}} 산업군의 기업들과 협력하며, 기업 문제 해결을 위한 데이터 분석 및 모델링 프로젝트를 진행하고 있습니다.

Growth Hackers에서 오는 2026년 10-12월에 진행될 산학협력프로젝트를 {{companyWithWaGwa}} 함께하고자 협업을 제안드립니다. {{motivation}}하여, {{recipientReference}}께 연락드리게 되었습니다. 제품의 문제 정의 및 현 시점의 과제에 기반하여, 데이터 분석을 통한 전략 제안 및 실행(Data Analysis) 혹은 모델링(Data Science) 프로젝트를 함께 진행하고자 합니다.

예를 들어,
{{projectIdeas}}
와 같은 프로젝트를 함께 고민해볼 수 있을 것이라 생각합니다.

사전 미팅을 통해 기업 상황에 적합한 프로젝트 주제를 상세 협의하며, 비즈니스 및 데이터 모델링에 역량을 가진 경영/산업공학/인공지능 관련 전공 등의 학회원들이 프로젝트를 수행하고 있습니다. 지난 해에 협업한 다수의 기업이 재진행 제안을 주셨으며, 정량적 비즈니스 임팩트와 함께 후속 인턴십 연계로도 활발히 이어질 만큼 높은 수준의 리소스 투입과 성과를 이어오고 있습니다.

저희 Growth Hackers에서 진행한 최근 프로젝트는 아래와 같습니다.
1. 더브이씨: LLM 기반 R&D 과제 및 기업 정보 요약 파이프라인 설계
2. 슈퍼센트: 하이브리드 캐주얼 게임의 플레이 흐름 기반 유저 광고 수익 최적화
3. 코인원: 유저 세그멘테이션 및 마르코프 체인 분석과 BERT4REC을 통한 리텐션 예측 모델 구성
4. 원셀프월드: 유저 세그멘테이션 기반 리텐션 전환 전략 제시

프로젝트 진행 시, 예상 타임라인은 아래와 같습니다. (변동 가능)
1. 참여 인원 확정 및 킥오프 미팅: 9월 4주차~9월 5주차
2. 중간 발표: 11월 1-2주차
3. 최종 발표: 12월 3~4주차

현재는 10~12월 프로젝트를 우선적으로 제안드리고 있으나 데이터 적재 및 프로젝트 준비, 팀 배정 등 제반 상황에 따라 차기 1~2월 일정으로 협의를 이어갈 수도 있습니다.

Growth Hackers 과거 프로젝트에 관한 상세 내용과 협업 방식을 포함한 소개서를 함께 송부드립니다. 앞선 주제 이외에도 현재 내부적으로 고려하고 계신 데이터 관련 과제가 있으시거나 궁금하신 점이 있으시면, 본 메시지나 아래 연락처 통해 회신 주시면 상세히 답변드리겠습니다.

감사합니다.

Growth Hackers 대외협력팀장 여재욱 드림

메일: contact@ghsnu.com
전화: 010-4757-3987$$,
    true
  )
ON CONFLICT ("id") DO UPDATE
SET
  "route" = EXCLUDED."route",
  "channel" = EXCLUDED."channel",
  "version" = EXCLUDED."version",
  "subject_template" = EXCLUDED."subject_template",
  "body_template" = EXCLUDED."body_template",
  "active" = EXCLUDED."active";
