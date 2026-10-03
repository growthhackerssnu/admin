-- 수주 회차(acquisition_rounds)와 기업·회차별 Outreach, 수주 결과 이력.
--
-- 1) outreaches.company_id 단독 unique를 (company_id, acquisition_round_id)로 바꾼다.
--    기존 행은 acquisition_round_id가 NULL로 남는다(시작·종료 시각을 추정하지 않는다).
--    NULL은 서로 다른 값으로 취급되므로 기존 행끼리 충돌하지 않는다.
-- 2) 진행 중(ended_at IS NULL) 회차는 전체에서 한 건만 허용한다. Prisma로 표현할 수
--    없는 부분 유니크 인덱스라 직접 쓴다(§7.3).
-- 3) 새 테이블은 RLS를 켜고 anon/authenticated 권한을 회수한다(§9.1).

-- CreateEnum
CREATE TYPE "dh"."OutcomeStatus" AS ENUM ('pending', 'won', 'rejected', 'unresolved');

-- CreateEnum
CREATE TYPE "dh"."OutcomeEventSource" AS ENUM ('manual', 'send_record', 'round_close');

-- DropIndex
DROP INDEX "dh"."outreaches_company_id_key";

-- AlterTable
ALTER TABLE "dh"."outreaches" ADD COLUMN     "acquisition_round_id" TEXT,
ADD COLUMN     "outcome_status" "dh"."OutcomeStatus",
ADD COLUMN     "previous_outreach_id" TEXT;

-- AlterTable
ALTER TABLE "dh"."message_draft_revisions" ADD COLUMN     "generation_history" JSONB;

-- CreateTable
CREATE TABLE "dh"."acquisition_rounds" (
    "id" TEXT NOT NULL,
    "target_quarter_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acquisition_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."outreach_outcome_events" (
    "id" TEXT NOT NULL,
    "outreach_id" TEXT NOT NULL,
    "from_status" "dh"."OutcomeStatus",
    "to_status" "dh"."OutcomeStatus" NOT NULL,
    "note" TEXT,
    "source" "dh"."OutcomeEventSource" NOT NULL,
    "actor_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_outcome_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outreach_outcome_events_outreach_id_recorded_at_id_idx" ON "dh"."outreach_outcome_events"("outreach_id", "recorded_at", "id");

-- CreateIndex
CREATE INDEX "outreaches_acquisition_round_id_owner_id_idx" ON "dh"."outreaches"("acquisition_round_id", "owner_id");

-- CreateIndex
CREATE INDEX "outreaches_acquisition_round_id_outcome_status_idx" ON "dh"."outreaches"("acquisition_round_id", "outcome_status");

-- CreateIndex
CREATE UNIQUE INDEX "outreaches_company_id_acquisition_round_id_key" ON "dh"."outreaches"("company_id", "acquisition_round_id");

-- CreateIndex
CREATE INDEX "sent_messages_outreach_id_sent_at_id_idx" ON "dh"."sent_messages"("outreach_id", "sent_at", "id");

-- 진행 중 회차는 한 건만. 상수 식 인덱스라 행이 하나라도 더 열려 있으면 INSERT가 실패한다.
CREATE UNIQUE INDEX "acquisition_rounds_single_open_key"
  ON "dh"."acquisition_rounds" ((true))
  WHERE "ended_at" IS NULL;

-- AddForeignKey
ALTER TABLE "dh"."acquisition_rounds" ADD CONSTRAINT "acquisition_rounds_target_quarter_id_fkey" FOREIGN KEY ("target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."acquisition_rounds" ADD CONSTRAINT "acquisition_rounds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."acquisition_rounds" ADD CONSTRAINT "acquisition_rounds_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreach_outcome_events" ADD CONSTRAINT "outreach_outcome_events_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "dh"."outreaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreach_outcome_events" ADD CONSTRAINT "outreach_outcome_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreaches" ADD CONSTRAINT "outreaches_acquisition_round_id_fkey" FOREIGN KEY ("acquisition_round_id") REFERENCES "dh"."acquisition_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreaches" ADD CONSTRAINT "outreaches_previous_outreach_id_fkey" FOREIGN KEY ("previous_outreach_id") REFERENCES "dh"."outreaches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Access is through the authenticated backend's Postgres connection, not the Data API.
ALTER TABLE "dh"."acquisition_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."outreach_outcome_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "dh"."acquisition_rounds" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."outreach_outcome_events" FROM anon, authenticated;
