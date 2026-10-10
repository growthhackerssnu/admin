-- 거래 내역을 같은 날 안에서도 기록한 순서로 보이도록 기록 시각을 둔다.
-- 기존 행은 지금 화면 순서(날짜 → 엑셀 행 번호 = id 끝 번호)대로 그날 0시부터 1초씩 채운다.
ALTER TABLE "nut"."ledger_entries" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "nut"."ledger_entries" AS e
SET "created_at" = e."transaction_date"::timestamp + o.rn * INTERVAL '1 second'
FROM (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "transaction_date"
    ORDER BY NULLIF(substring("id" FROM '(\d+)$'), '')::numeric NULLS LAST, "id"
  ) AS rn
  FROM "nut"."ledger_entries"
) AS o
WHERE o."id" = e."id";

DROP INDEX IF EXISTS "nut"."ledger_entries_period_id_transaction_date_idx";
CREATE INDEX "ledger_entries_period_id_transaction_date_created_at_idx" ON "nut"."ledger_entries"("period_id", "transaction_date", "created_at");
