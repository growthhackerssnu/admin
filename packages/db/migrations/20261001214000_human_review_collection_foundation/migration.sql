-- CreateEnum
CREATE TYPE "dh"."OutreachSendStatus" AS ENUM ('before_send', 'sent');

-- CreateEnum
CREATE TYPE "dh"."ResearchPipeline" AS ENUM ('legacy', 'human_review');

-- CreateEnum
CREATE TYPE "dh"."CollectionSourceKind" AS ENUM ('web_archive', 'gmail');

-- CreateEnum
CREATE TYPE "dh"."CollectionItemStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "dh"."CollectedCompanyResult" AS ENUM ('created', 'duplicate', 'error');

-- CreateEnum
CREATE TYPE "dh"."CandidateResearchStatus" AS ENUM ('queued', 'running', 'ready', 'error');

-- CreateEnum
CREATE TYPE "dh"."CandidateReviewStatus" AS ENUM ('unreviewed', 'reviewing', 'approved', 'rejected_fit', 'rejected_contact');

-- CreateEnum
CREATE TYPE "dh"."CandidateReviewAction" AS ENUM ('approve', 'reject_fit', 'reject_contact', 'reopen');

-- CreateEnum
CREATE TYPE "dh"."HumanReviewFit" AS ENUM ('fit', 'unfit');

-- CreateEnum
CREATE TYPE "dh"."ContactCheckResult" AS ENUM ('confirmed', 'not_found', 'unchecked');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "dh"."ResearchTaskTrigger" ADD VALUE 'cron';
ALTER TYPE "dh"."ResearchTaskTrigger" ADD VALUE 'retry';

-- DropForeignKey
ALTER TABLE "dh"."search_runs" DROP CONSTRAINT "search_runs_target_quarter_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."search_runs" DROP CONSTRAINT "search_runs_assigned_member_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."search_runs" DROP CONSTRAINT "search_runs_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."company_researches" DROP CONSTRAINT "company_researches_origin_search_run_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."candidates" DROP CONSTRAINT "candidates_origin_search_run_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."research_tasks" DROP CONSTRAINT "research_tasks_search_run_id_fkey";

-- AlterTable
ALTER TABLE "dh"."outreaches" ADD COLUMN     "candidate_id" TEXT,
ADD COLUMN     "contact_purpose" TEXT,
ADD COLUMN     "send_status" "dh"."OutreachSendStatus";

-- AlterTable
ALTER TABLE "dh"."message_draft_revisions" ADD COLUMN     "contact_purpose_snapshot" TEXT,
ADD COLUMN     "generation_research_id" TEXT,
ADD COLUMN     "generation_review_decision_id" TEXT,
ADD COLUMN     "history_source_ids" JSONB,
ADD COLUMN     "recipient_contact_id" TEXT,
ADD COLUMN     "recipient_endpoint_id" TEXT,
ADD COLUMN     "recipient_snapshot" JSONB,
ADD COLUMN     "target_quarter_id" TEXT;

-- AlterTable
ALTER TABLE "dh"."sent_messages" ADD COLUMN     "draft_revision" INTEGER,
ADD COLUMN     "recorded_by_id" TEXT;

-- AlterTable
ALTER TABLE "dh"."search_runs" ADD COLUMN     "scheduled_for" TIMESTAMP(3),
ADD COLUMN     "source_id" TEXT,
ALTER COLUMN "target_quarter_id" DROP NOT NULL,
ALTER COLUMN "assigned_member_id" DROP NOT NULL,
ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "dh"."company_researches" ALTER COLUMN "origin_search_run_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "dh"."candidates" ADD COLUMN     "active_review_decision_id" TEXT,
ADD COLUMN     "origin_collected_company_id" TEXT,
ADD COLUMN     "research_status" "dh"."CandidateResearchStatus",
ADD COLUMN     "review_owner_id" TEXT,
ADD COLUMN     "review_status" "dh"."CandidateReviewStatus",
ADD COLUMN     "selected_contact_id" TEXT,
ADD COLUMN     "selected_endpoint_id" TEXT,
ALTER COLUMN "origin_search_run_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "dh"."research_tasks" ADD COLUMN     "lease_token" TEXT,
ADD COLUMN     "lease_until" TIMESTAMP(3),
ADD COLUMN     "pipeline" "dh"."ResearchPipeline" NOT NULL DEFAULT 'legacy',
ALTER COLUMN "search_run_id" DROP NOT NULL,
ALTER COLUMN "followup_policy" DROP NOT NULL;

-- CreateTable
CREATE TABLE "dh"."collection_sources" (
    "id" TEXT NOT NULL,
    "kind" "dh"."CollectionSourceKind" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "parser_version" TEXT NOT NULL,

    CONSTRAINT "collection_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."collection_items" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "first_run_id" TEXT NOT NULL,
    "external_key" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "published_at" TIMESTAMP(3),
    "content_hash" TEXT,
    "parser_version" TEXT NOT NULL,
    "status" "dh"."CollectionItemStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "retryable" BOOLEAN,
    "extracted_at" TIMESTAMP(3),

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."collected_companies" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "company_id" TEXT,
    "candidate_id" TEXT,
    "result" "dh"."CollectedCompanyResult" NOT NULL,
    "error_code" TEXT,

    CONSTRAINT "collected_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."company_name_keys" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_name_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."candidate_review_decisions" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "action" "dh"."CandidateReviewAction" NOT NULL,
    "fit" "dh"."HumanReviewFit",
    "contact_result" "dh"."ContactCheckResult" NOT NULL,
    "research_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "endpoint_id" TEXT,
    "note" TEXT,
    "decided_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_sources_key_key" ON "dh"."collection_sources"("key");

-- CreateIndex
CREATE INDEX "collection_items_status_lease_until_idx" ON "dh"."collection_items"("status", "lease_until");

-- CreateIndex
CREATE INDEX "collection_items_first_run_id_idx" ON "dh"."collection_items"("first_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_source_id_external_key_key" ON "dh"."collection_items"("source_id", "external_key");

-- CreateIndex
CREATE INDEX "collected_companies_company_id_idx" ON "dh"."collected_companies"("company_id");

-- CreateIndex
CREATE INDEX "collected_companies_candidate_id_idx" ON "dh"."collected_companies"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "collected_companies_item_id_normalized_name_key" ON "dh"."collected_companies"("item_id", "normalized_name");

-- CreateIndex
CREATE INDEX "company_name_keys_company_id_idx" ON "dh"."company_name_keys"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_name_keys_source_id_normalized_name_key" ON "dh"."company_name_keys"("source_id", "normalized_name");

-- CreateIndex
CREATE INDEX "candidate_review_decisions_candidate_id_created_at_id_idx" ON "dh"."candidate_review_decisions"("candidate_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "outreaches_candidate_id_idx" ON "dh"."outreaches"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "sent_messages_outreach_id_draft_revision_key" ON "dh"."sent_messages"("outreach_id", "draft_revision");

-- CreateIndex
CREATE UNIQUE INDEX "search_runs_source_id_scheduled_for_key" ON "dh"."search_runs"("source_id", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_origin_collected_company_id_key" ON "dh"."candidates"("origin_collected_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_active_review_decision_id_key" ON "dh"."candidates"("active_review_decision_id");

-- CreateIndex
CREATE INDEX "research_tasks_pipeline_type_status_created_at_idx" ON "dh"."research_tasks"("pipeline", "type", "status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "dh"."outreaches" ADD CONSTRAINT "outreaches_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_generation_research_id_fkey" FOREIGN KEY ("generation_research_id") REFERENCES "dh"."company_researches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_generation_review_decision_id_fkey" FOREIGN KEY ("generation_review_decision_id") REFERENCES "dh"."candidate_review_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_recipient_contact_id_fkey" FOREIGN KEY ("recipient_contact_id") REFERENCES "dh"."contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_recipient_endpoint_id_fkey" FOREIGN KEY ("recipient_endpoint_id") REFERENCES "dh"."contact_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_target_quarter_id_fkey" FOREIGN KEY ("target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."sent_messages" ADD CONSTRAINT "sent_messages_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."collection_items" ADD CONSTRAINT "collection_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "dh"."collection_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."collection_items" ADD CONSTRAINT "collection_items_first_run_id_fkey" FOREIGN KEY ("first_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."collected_companies" ADD CONSTRAINT "collected_companies_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "dh"."collection_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."collected_companies" ADD CONSTRAINT "collected_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "dh"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."collected_companies" ADD CONSTRAINT "collected_companies_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."company_name_keys" ADD CONSTRAINT "company_name_keys_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "dh"."collection_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."company_name_keys" ADD CONSTRAINT "company_name_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "dh"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "dh"."collection_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_target_quarter_id_fkey" FOREIGN KEY ("target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."company_researches" ADD CONSTRAINT "company_researches_origin_search_run_id_fkey" FOREIGN KEY ("origin_search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_origin_collected_company_id_fkey" FOREIGN KEY ("origin_collected_company_id") REFERENCES "dh"."collected_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_review_owner_id_fkey" FOREIGN KEY ("review_owner_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_selected_contact_id_fkey" FOREIGN KEY ("selected_contact_id") REFERENCES "dh"."contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_selected_endpoint_id_fkey" FOREIGN KEY ("selected_endpoint_id") REFERENCES "dh"."contact_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_active_review_decision_id_fkey" FOREIGN KEY ("active_review_decision_id") REFERENCES "dh"."candidate_review_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_origin_search_run_id_fkey" FOREIGN KEY ("origin_search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidate_review_decisions" ADD CONSTRAINT "candidate_review_decisions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidate_review_decisions" ADD CONSTRAINT "candidate_review_decisions_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "dh"."company_researches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidate_review_decisions" ADD CONSTRAINT "candidate_review_decisions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "dh"."contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidate_review_decisions" ADD CONSTRAINT "candidate_review_decisions_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "dh"."contact_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidate_review_decisions" ADD CONSTRAINT "candidate_review_decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."research_tasks" ADD CONSTRAINT "research_tasks_search_run_id_fkey" FOREIGN KEY ("search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 신규 업무 테이블은 서버의 직접 Postgres 연결에서만 사용한다.
-- Data API 역할에는 권한을 주지 않고 RLS도 기본 거부로 켠다.
ALTER TABLE "dh"."collection_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."collection_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."collected_companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."company_name_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."candidate_review_decisions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "dh"."collection_sources" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."collection_items" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."collected_companies" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."company_name_keys" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."candidate_review_decisions" FROM anon, authenticated;
