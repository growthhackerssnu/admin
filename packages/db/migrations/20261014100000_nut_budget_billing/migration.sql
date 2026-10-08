-- NUT 예산 항목의 결제 시기. 연간 구독과 계절 단체복은 한쪽 반기에만 예산이 잡히고, 일회성 비용은 새 반기로 넘어가지 않는다.
-- every(매 반기) · spring(봄·여름 반기만) · fall(가을·겨울 반기만) · once(이번 반기만)
ALTER TABLE "nut"."budget_nodes" ADD COLUMN "billing" TEXT NOT NULL DEFAULT 'every';

-- 1. 연간 결제: CreatorLink(11월 30일)·비상주 사무실은 가을·겨울, 노션 플러스(1월 15일)는 봄·여름에 20만원.
UPDATE "nut"."budget_nodes" SET "billing" = 'fall' WHERE "name" IN ('CreatorLink', '비상주 사무실');
UPDATE "nut"."budget_nodes" SET "billing" = 'spring', "budget" = 200000 WHERE "name" = '노션 플러스';

-- 2. 법인화 비용은 2026-2에 한 번 쓴 돈이다(그 묶음 '기타 비용'도).
UPDATE "nut"."budget_nodes" SET "billing" = 'once'
WHERE "period_id" = '2026-2h' AND "name" IN ('법인화 비용', '기타 비용');

-- 3. 단체복: 봄·여름은 반팔티, 가을·겨울은 후리스. 후리스 항목 바로 앞에 반팔티 항목을 만든다.
UPDATE "nut"."budget_nodes" SET "billing" = 'fall'
WHERE "formula_expression" LIKE '%fleece-per-person%';

INSERT INTO "nut"."budget_nodes"
  ("id", "period_id", "name", "parent_id", "level", "kind", "tax_class", "budget", "spent", "sort_order",
   "formula_expression", "note", "active", "billing")
SELECT 'budget-node-tshirt-' || n."period_id", n."period_id", replace(n."name", '후리스', '반팔티'), n."parent_id",
       n."level", n."kind", n."tax_class", 0, 0, n."sort_order",
       'tshirt-per-person * (cohort-senior + cohort-junior)', '배송비 포함', true, 'spring'
FROM "nut"."budget_nodes" n
WHERE n."active" AND n."formula_expression" LIKE '%fleece-per-person%' AND n."name" LIKE '%후리스%';

UPDATE "nut"."budget_nodes" AS s SET "sort_order" = s."sort_order" + 1
FROM "nut"."budget_nodes" t
WHERE t."id" LIKE 'budget-node-tshirt-%' AND s."period_id" = t."period_id" AND s."parent_id" = t."parent_id"
  AND s."id" <> t."id" AND s."sort_order" >= t."sort_order";

-- 4. 산출식 항목의 메모에 박힌 인원·단가(예: '인당 20,000원 * 14명')는 설정을 바꾸면 틀어진다.
--    계산 내역은 화면이 설정 값으로 보여주므로, 메모에는 숫자가 아닌 설명만 남긴다. 26-S Slack 할인 문구도 뺀다.
UPDATE "nut"."budget_nodes" SET "note" = CASE
    WHEN "name" LIKE '%단체복%' THEN '배송비 포함'
    WHEN "name" = 'Slack' THEN '매달 1일 결제'
    WHEN "name" = 'G-SUITE' THEN 'GH 구글 드라이브 운영 비용 / 매달 1일 결제'
    ELSE NULL
  END
WHERE "formula_expression" IS NOT NULL;

UPDATE "nut"."budget_parameters" SET "description" = ''
WHERE "period_id" = '2027-1h' AND "id" = 'slack-months-senior';

-- 새 반기 복사 때 메모의 기수가 밀리지 않았던 것.
UPDATE "nut"."budget_nodes" SET "note" = '21기 명함 + 웰컴 기프트'
WHERE "period_id" = '2027-1h' AND "note" = '20기 명함 + 웰컴 기프트';

-- 5. 새 반기는 기초 잔액 없이 시작한다. 19기 잔액은 20기에 '26-2 잔금' 수입으로 들어온다(19기의 '26-1 잔금'처럼).
UPDATE "nut"."finance_periods" SET "opening_cash" = 0, "current_cash" = 0 WHERE "id" = '2027-1h';
