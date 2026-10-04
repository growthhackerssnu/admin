-- NUT 반기 분리 + 청구서 처리 흐름.
-- 기존 행은 모두 2026 하반기(2026-2h) 자료라 그 반기로 채운다.

ALTER TABLE "nut"."budget_nodes" ADD COLUMN "period_id" TEXT NOT NULL DEFAULT '2026-2h';
ALTER TABLE "nut"."budget_nodes" ALTER COLUMN "period_id" DROP DEFAULT;
DROP INDEX IF EXISTS "nut"."budget_nodes_parent_id_sort_order_idx";
CREATE INDEX "budget_nodes_period_id_parent_id_sort_order_idx" ON "nut"."budget_nodes"("period_id", "parent_id", "sort_order");

-- 파라미터 id는 산출식 변수명이라 반기마다 재사용한다 → (period_id, id) 복합키.
ALTER TABLE "nut"."budget_parameters" ADD COLUMN "period_id" TEXT NOT NULL DEFAULT '2026-2h';
ALTER TABLE "nut"."budget_parameters" ALTER COLUMN "period_id" DROP DEFAULT;
ALTER TABLE "nut"."budget_parameters" DROP CONSTRAINT "budget_parameters_pkey";
ALTER TABLE "nut"."budget_parameters" ADD CONSTRAINT "budget_parameters_pkey" PRIMARY KEY ("period_id", "id");

ALTER TABLE "nut"."ledger_entries" ADD COLUMN "period_id" TEXT NOT NULL DEFAULT '2026-2h';
ALTER TABLE "nut"."ledger_entries" ALTER COLUMN "period_id" DROP DEFAULT;
DROP INDEX IF EXISTS "nut"."ledger_entries_transaction_date_idx";
CREATE INDEX "ledger_entries_period_id_transaction_date_idx" ON "nut"."ledger_entries"("period_id", "transaction_date");

ALTER TABLE "nut"."accounting_details" ADD COLUMN "period_id" TEXT NOT NULL DEFAULT '2026-2h';
ALTER TABLE "nut"."accounting_details" ALTER COLUMN "period_id" DROP DEFAULT;
DROP INDEX IF EXISTS "nut"."accounting_details_scope_owner_date_idx";
CREATE INDEX "accounting_details_period_id_scope_owner_date_idx" ON "nut"."accounting_details"("period_id", "scope", "owner", "date");

ALTER TABLE "nut"."accounting_summaries" ADD COLUMN "period_id" TEXT NOT NULL DEFAULT '2026-2h';
ALTER TABLE "nut"."accounting_summaries" ALTER COLUMN "period_id" DROP DEFAULT;
DROP INDEX IF EXISTS "nut"."accounting_summaries_scope_name_idx";
CREATE UNIQUE INDEX "accounting_summaries_period_id_scope_name_key" ON "nut"."accounting_summaries"("period_id", "scope", "name");

ALTER TABLE "nut"."claims" ADD COLUMN "period_id" TEXT NOT NULL DEFAULT '2026-2h';
ALTER TABLE "nut"."claims" ALTER COLUMN "period_id" DROP DEFAULT;
ALTER TABLE "nut"."claims"
  ADD COLUMN "member_id" TEXT,
  ADD COLUMN "bank_account" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "reject_reason" TEXT,
  ADD COLUMN "reviewed_by_member_id" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "paid_at" TIMESTAMP(3),
  ADD COLUMN "ledger_entry_id" TEXT,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
DROP INDEX IF EXISTS "nut"."claims_status_date_idx";
CREATE INDEX "claims_period_id_status_date_idx" ON "nut"."claims"("period_id", "status", "date");
CREATE UNIQUE INDEX "claims_ledger_entry_id_key" ON "nut"."claims"("ledger_entry_id");

-- 반기 삭제·오타를 DB가 막도록 FK. finance_periods.id가 기준.
ALTER TABLE "nut"."budget_nodes" ADD CONSTRAINT "budget_nodes_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "nut"."finance_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nut"."budget_parameters" ADD CONSTRAINT "budget_parameters_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "nut"."finance_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nut"."ledger_entries" ADD CONSTRAINT "ledger_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "nut"."finance_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nut"."accounting_details" ADD CONSTRAINT "accounting_details_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "nut"."finance_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nut"."accounting_summaries" ADD CONSTRAINT "accounting_summaries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "nut"."finance_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nut"."claims" ADD CONSTRAINT "claims_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "nut"."finance_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
