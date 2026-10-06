-- NUT 예산 설정: 시트 '예산안'처럼 인원·단가를 설정으로 빼고 산출식이 그것을 쓰게 한다.
-- 예산액은 바뀌지 않는다(같은 값을 설정으로 옮겼을 뿐).

ALTER TABLE "nut"."budget_parameters" ALTER COLUMN "value" TYPE DOUBLE PRECISION;
ALTER TABLE "nut"."budget_parameters" ADD COLUMN "category" TEXT NOT NULL DEFAULT '기타';
ALTER TABLE "nut"."budget_parameters" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- 총원·참여 인원은 이제 팀별 인원에서 계산한다(코드의 DERIVED_PARAMETERS).
DELETE FROM "nut"."budget_parameters" WHERE "id" IN ('cohort-19', 'cohort-20', 'summer-participants', 'next-participants');

-- 기존 입력 기준의 묶음·순서·이름.
UPDATE "nut"."budget_parameters" AS p SET "category" = v.category, "sort_order" = v.sort_order, "label" = v.label
FROM (VALUES
  ('business-19', '인원', 10, '대협 19기'),
  ('business-20', '인원', 11, '대협 20기'),
  ('hr-19', '인원', 20, 'HR 19기'),
  ('hr-20', '인원', 21, 'HR 20기'),
  ('pr-19', '인원', 30, 'PR 19기'),
  ('pr-20', '인원', 31, 'PR 20기'),
  ('summer-teams', '프로젝트', 20, '방학 프로젝트 팀 수'),
  ('next-teams', '프로젝트', 30, '다음 학기 프로젝트 팀 수'),
  ('freelance-contract-cost', '기타', 90, '프리랜서 계약비용')
) AS v(id, category, sort_order, label)
WHERE p."id" = v.id;

-- 새 기준: 지금 산출식 안에 숫자로 박혀 있던 단가들. 2026 하반기에만 넣는다(다른 반기는 복사로 이어받음).
INSERT INTO "nut"."budget_parameters" ("period_id", "id", "label", "value", "unit", "description", "category", "sort_order")
SELECT f.id, v.id, v.label, v.value, v.unit, v.description, v.category, v.sort_order
FROM "nut"."finance_periods" f
CROSS JOIN (VALUES
  ('summer-interns', '방학 인턴 인원', 1, '명', '방학 프로젝트 참여 인원 = 19기 총원 − 인턴', '프로젝트', 10),
  ('summer-support-per-person', '방학 팀지원비 (1인당)', 80000, '원', '방학 프로젝트 팀지원비 = 1인당 × 참여 인원', '지원 단가', 10),
  ('summer-tech-per-month', '방학 기술지원비 (팀당 월)', 130000, '원', '방학 기술지원비 = 월 × 개월 × 팀 수 + 사이드 프로젝트', '지원 단가', 11),
  ('summer-tech-months', '방학 기술지원 개월 수', 2, '개월', '', '지원 단가', 12),
  ('side-project-tech', '사이드 프로젝트 기술지원비', 100000, '원', '', '지원 단가', 13),
  ('next-support-per-person', '정규 팀지원비 (1인당)', 130000, '원', '정규 프로젝트 팀지원비 = 1인당 × 참여 인원', '지원 단가', 20),
  ('next-tech-per-month', '정규 기술지원비 (팀당 월)', 150000, '원', '정규 기술지원비 = 월 × 개월 × 팀 수', '지원 단가', 21),
  ('next-tech-months', '정규 기술지원 개월 수', 3, '개월', '', '지원 단가', 22),
  ('ops-support-per-person', '운영팀 지원비 (1인당 학기)', 30000, '원', 'HR·PR·대협 지원비 = 1인당 × (19기 × 2학기 + 20기 × 1학기)', '지원 단가', 30),
  ('uniform-per-person', '단체복 (1인당)', 50000, '원', '배송비 포함', '지원 단가', 40),
  ('mentoring-per-person', '멘토멘티 (1인당)', 25000, '원', '19기 + 20기 전원', '지원 단가', 41),
  ('rookie-per-person', '루키팀플 (1인당)', 20000, '원', '20기 전원', '지원 단가', 42),
  ('event-per-person', '경조사·스터디 지원 (1인당)', 20000, '원', '전체 인원의 절반 예상', '지원 단가', 43),
  ('alumni-fee', '알럼나이 섭외비 (1인당)', 100000, '원', '', '지원 단가', 50),
  ('alumni-speakers', '알럼나이 섭외 인원', 8, '명', '', '지원 단가', 51),
  ('usd-krw', '환율', 1500, '원/$', '달러 결제 구독 계산에 쓴다', '구독·환율', 10),
  ('slack-usd-per-seat', 'Slack (1인당 월)', 8.75, '$', '', '구독·환율', 20),
  ('slack-months-19', 'Slack 19기 개월 수', 4.5, '개월', '할인 기간 반영', '구독·환율', 21),
  ('slack-months-20', 'Slack 20기 개월 수', 3, '개월', '', '구독·환율', 22),
  ('gsuite-usd-per-month', 'G-SUITE (월)', 15.84, '$', '', '구독·환율', 30),
  ('gsuite-months', 'G-SUITE 개월 수', 6, '개월', '', '구독·환율', 31)
) AS v(id, label, value, unit, description, category, sort_order)
WHERE f.id = '2026-2h'
ON CONFLICT ("period_id", "id") DO NOTHING;

-- 산출식이 단가 설정을 쓰게 바꾼다(결과 금액은 같다).
UPDATE "nut"."budget_nodes" AS n SET "formula_expression" = v.expression, "formula_key" = NULL
FROM (VALUES
  ('budget-minor-2', 'gsuite-usd-per-month * gsuite-months * usd-krw'),
  ('budget-minor-4', 'round(slack-usd-per-seat * usd-krw * (cohort-19 * slack-months-19 + cohort-20 * slack-months-20) / 10000) * 10000'),
  ('budget-minor-7', 'summer-support-per-person * summer-participants'),
  ('budget-minor-8', 'summer-tech-per-month * summer-tech-months * summer-teams + side-project-tech'),
  ('budget-minor-9', 'next-support-per-person * next-participants'),
  ('budget-minor-10', 'next-tech-per-month * next-tech-months * next-teams'),
  ('budget-minor-15', 'alumni-fee * alumni-speakers'),
  ('budget-minor-16', 'ops-support-per-person * (hr-19 * 2 + hr-20)'),
  ('budget-minor-20', 'ops-support-per-person * (business-19 * 2 + business-20)'),
  ('budget-minor-21', 'uniform-per-person * cohort-19'),
  ('budget-minor-22', 'uniform-per-person * (cohort-19 + cohort-20)'),
  ('budget-minor-25', 'ops-support-per-person * (pr-19 * 2 + pr-20)'),
  ('budget-minor-30', 'mentoring-per-person * (cohort-19 + cohort-20)'),
  ('budget-minor-31', 'rookie-per-person * cohort-20'),
  ('budget-minor-39', 'event-per-person * ceil((cohort-19 + cohort-20) / 2)'),
  ('budget-minor-43', 'event-per-person * ceil((cohort-19 + cohort-20) / 2)')
) AS v(id, expression)
WHERE n."id" = v.id AND n."period_id" = '2026-2h';
