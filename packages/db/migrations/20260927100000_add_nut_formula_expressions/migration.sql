ALTER TABLE "nut"."budget_nodes"
ADD COLUMN "formula_expression" TEXT;

UPDATE "nut"."budget_nodes"
SET "formula_expression" = CASE "formula_key"
  WHEN 'slack' THEN 'round(8.75 * 1500 * (cohort-19 * 4.5 + cohort-20 * 3) / 10000) * 10000'
  WHEN 'summerSupport' THEN '80000 * summer-participants'
  WHEN 'summerTech' THEN '260000 * summer-teams + 100000'
  WHEN 'nextSupport' THEN '130000 * next-participants'
  WHEN 'nextTech' THEN '450000 * next-teams'
  WHEN 'hrSupport' THEN '30000 * (hr-19 * 2 + hr-20)'
  WHEN 'prSupport' THEN '30000 * (pr-19 * 2 + pr-20)'
  WHEN 'businessSupport' THEN '30000 * (business-19 * 2 + business-20)'
  ELSE NULL
END
WHERE "formula_key" IS NOT NULL;
