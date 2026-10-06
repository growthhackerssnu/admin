-- NUT: 반기 = 운영팀 기수, 기수에 묶이지 않는 설정, 방학/정규 팀 구분, 회계 행의 팀 연결, 세금 입력값.

-- 1. 반기의 운영팀 기수. 2026-2 = 19기, 다음 반기마다 +1.
ALTER TABLE "nut"."finance_periods" ADD COLUMN "operating_cohort" INTEGER;
UPDATE "nut"."finance_periods" SET "operating_cohort" = 19, "label" = '2026-2 · 19기 운영팀 임기' WHERE "id" = '2026-2h';
UPDATE "nut"."finance_periods" SET "operating_cohort" = 19 WHERE "operating_cohort" IS NULL;
ALTER TABLE "nut"."finance_periods" ALTER COLUMN "operating_cohort" SET NOT NULL;

-- 2. 설정 id를 기수 대신 역할로: 운영 기수(senior)·신입 기수(junior). 이름의 {senior}/{junior}는 화면에서 기수로 바뀐다.
UPDATE "nut"."budget_parameters" AS p SET "id" = v.new_id
FROM (VALUES
  ('business-19', 'business-senior'), ('business-20', 'business-junior'),
  ('hr-19', 'hr-senior'), ('hr-20', 'hr-junior'),
  ('pr-19', 'pr-senior'), ('pr-20', 'pr-junior'),
  ('slack-months-19', 'slack-months-senior'), ('slack-months-20', 'slack-months-junior')
) AS v(old_id, new_id)
WHERE p."id" = v.old_id;

UPDATE "nut"."budget_nodes" SET "formula_expression" =
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    "formula_expression",
    'slack-months-19', 'slack-months-senior'), 'slack-months-20', 'slack-months-junior'),
    'business-19', 'business-senior'), 'business-20', 'business-junior'),
    'hr-19', 'hr-senior'), 'hr-20', 'hr-junior'),
    'pr-19', 'pr-senior'), 'pr-20', 'pr-junior'),
    'cohort-19', 'cohort-senior'), 'cohort-20', 'cohort-junior')
WHERE "formula_expression" IS NOT NULL;

-- 무엇을 위한 돈인지로 묶고 그 안에서 순서를 정한다. 설명은 쉬운 한국어로.
UPDATE "nut"."budget_parameters" AS p
SET "category" = v.category, "sort_order" = v.sort_order, "label" = v.label, "description" = v.description
FROM (VALUES
  ('business-senior', '인원', 10, '대협 {senior}기', ''),
  ('business-junior', '인원', 11, '대협 {junior}기', ''),
  ('hr-senior', '인원', 20, 'HR {senior}기', ''),
  ('hr-junior', '인원', 21, 'HR {junior}기', ''),
  ('pr-senior', '인원', 30, 'PR {senior}기', ''),
  ('pr-junior', '인원', 31, 'PR {junior}기', ''),
  ('summer-interns', '방학 프로젝트', 10, '방학 인턴 인원', '참여 인원에서 빠진다'),
  ('summer-teams', '방학 프로젝트', 20, '방학 프로젝트 팀 수', ''),
  ('summer-support-per-person', '방학 프로젝트', 30, '팀지원비 (1인당)', '참여 인원 수만큼'),
  ('summer-tech-per-month', '방학 프로젝트', 40, '기술지원비 (팀당 한 달)', ''),
  ('summer-tech-months', '방학 프로젝트', 41, '기술지원 개월 수', ''),
  ('side-project-tech', '방학 프로젝트', 50, '사이드 프로젝트 기술지원비', ''),
  ('next-teams', '정규 프로젝트', 20, '정규 프로젝트 팀 수', ''),
  ('next-support-per-person', '정규 프로젝트', 30, '팀지원비 (1인당)', '참여 인원 수만큼'),
  ('next-tech-per-month', '정규 프로젝트', 40, '기술지원비 (팀당 한 달)', ''),
  ('next-tech-months', '정규 프로젝트', 41, '기술지원 개월 수', ''),
  ('ops-support-per-person', '운영팀 지원', 10, '운영팀 지원비 (1인당 한 학기)', '{senior}기는 두 학기, {junior}기는 한 학기'),
  ('uniform-per-person', '행사·복지', 10, '단체복 (1인당)', '배송비 포함'),
  ('mentoring-per-person', '행사·복지', 20, '멘토멘티 (1인당)', '{senior}기와 {junior}기 전원'),
  ('rookie-per-person', '행사·복지', 30, '루키팀플 (1인당)', '{junior}기 전원'),
  ('event-per-person', '행사·복지', 40, '경조사·스터디 지원 (1인당)', '전체 인원의 절반 예상'),
  ('alumni-speakers', '행사·복지', 50, '알럼나이 섭외 인원', ''),
  ('alumni-fee', '행사·복지', 51, '알럼나이 섭외비 (1인당)', ''),
  ('usd-krw', '구독·환율', 10, '환율 (1달러)', '달러로 내는 구독료 계산에 쓴다'),
  ('slack-usd-per-seat', '구독·환율', 20, 'Slack (1인당 한 달)', ''),
  ('slack-months-senior', '구독·환율', 21, 'Slack {senior}기 개월 수', '할인 기간 반영'),
  ('slack-months-junior', '구독·환율', 22, 'Slack {junior}기 개월 수', ''),
  ('gsuite-usd-per-month', '구독·환율', 30, 'G-SUITE (한 달)', ''),
  ('gsuite-months', '구독·환율', 31, 'G-SUITE 개월 수', '')
) AS v(id, category, sort_order, label, description)
WHERE p."id" = v.id;

-- 프리랜서 계약비용은 세금 탭(원천징수)으로 옮긴다.
DELETE FROM "nut"."budget_parameters" WHERE "id" = 'freelance-contract-cost';

-- 3. 프로젝트 팀의 방학/정규 구분.
ALTER TABLE "nut"."accounting_summaries" ADD COLUMN "term" TEXT NOT NULL DEFAULT '';
UPDATE "nut"."accounting_summaries" SET "term" = 'summer'
WHERE "period_id" = '2026-2h' AND "scope" = 'project' AND "name" IN ('세타원', '트이다', '워프스페이스', 'GH X GH (사이드 프로젝트)');
UPDATE "nut"."accounting_summaries" SET "term" = 'regular'
WHERE "period_id" = '2026-2h' AND "scope" = 'project' AND "name" IN ('NNT', '볼라', '사운독', '데이터뱅크', '모드하우스');
DROP INDEX IF EXISTS "nut"."accounting_summaries_period_id_scope_name_key";
CREATE UNIQUE INDEX "accounting_summaries_period_id_scope_term_name_key" ON "nut"."accounting_summaries"("period_id", "scope", "term", "name");

-- 4. 회계 행 → 팀. 팀을 지우면 연결만 끊긴다.
ALTER TABLE "nut"."ledger_entries" ADD COLUMN "team_id" TEXT;
ALTER TABLE "nut"."ledger_entries" ADD CONSTRAINT "ledger_entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "nut"."accounting_summaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ledger_entries_team_id_idx" ON "nut"."ledger_entries"("team_id");

-- 기존 '프로젝트 회계'·'운영팀 회계' 내역을 같은 금액·3일 이내·지원비 항목의 회계 행에 잇는다(한 행에 한 번만).
WITH candidates AS (
  SELECT d.id AS detail_id, l.id AS ledger_id, s.id AS team_id,
         row_number() OVER (PARTITION BY d.id ORDER BY abs(l.transaction_date - d.date), l.id) AS by_detail,
         row_number() OVER (PARTITION BY l.id ORDER BY abs(l.transaction_date - d.date), d.id) AS by_ledger
  FROM "nut"."accounting_details" d
  JOIN "nut"."accounting_summaries" s
    ON s.period_id = d.period_id AND s.scope = d.scope AND s.name = d.owner
  JOIN "nut"."ledger_entries" l
    ON l.period_id = d.period_id AND l.amount = d.amount AND l.type = 'expense'
   AND abs(l.transaction_date - d.date) <= 3 AND l.bucket LIKE '%지원비%'
)
UPDATE "nut"."ledger_entries" AS l SET "team_id" = c.team_id
FROM candidates c
WHERE l.id = c.ledger_id AND c.by_detail = 1 AND c.by_ledger = 1;

-- 5. 세금 탭 입력값.
CREATE TABLE "nut"."tax_inputs" (
  "key" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_inputs_pkey" PRIMARY KEY ("key")
);
