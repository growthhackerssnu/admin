CREATE TABLE "nut"."income_lines" (
  "id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "budget" BIGINT NOT NULL DEFAULT 0,
  "actual" BIGINT NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL,
  "note" TEXT,
  "tax_class" "nut"."NutTaxClass" NOT NULL,
  CONSTRAINT "income_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "income_lines_period_sort_order_idx" ON "nut"."income_lines" ("period_id", "sort_order");

INSERT INTO "nut"."income_lines" ("id", "period_id", "name", "budget", "actual", "sort_order", "note", "tax_class") VALUES
  ('income-line-1', '2026-2h', '26-1 잔금', 7000000, 7156931, 1, '진행안: 잔금 인계 예상', 'taxable_gain'),
  ('income-line-2', '2026-2h', '26-1 정규 프로젝트', 19340000, 19340000, 2, '예산안: 80만원 * 96.7% * 25명', 'taxable_gain'),
  ('income-line-3', '2026-2h', '동아리 지원금', 0, 0, 3, NULL, 'non_taxable_gain'),
  ('income-line-4', '2026-2h', '26-S 방학 프로젝트', 5420000, 3481200, 4, '예산안: 40만원 * 96.7% * 14명', 'taxable_gain'),
  ('income-line-5', '2026-2h', '26-S 인턴 학회비', 400000, 386800, 5, '예산안: 40만원 * 1명', 'taxable_gain'),
  ('income-line-6', '2026-2h', '26-1 비정규 내부 프로젝트', 0, 0, 6, NULL, 'non_taxable_gain'),
  ('income-line-7', '2026-2h', '26-1 벌금 총계', 90000, 0, 7, '예산안 예상 수입', 'non_taxable_gain'),
  ('income-line-8', '2026-2h', '카카오뱅크 이자', 70000, 0, 8, '예산안 예상 이자', 'taxable_gain'),
  ('income-line-9', '2026-2h', '홈커밍 후원금', 0, 0, 9, NULL, 'non_taxable_gain');

ALTER TABLE "nut"."income_lines" ENABLE ROW LEVEL SECURITY;
