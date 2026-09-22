-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'acting', 'alumni');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('email', 'linkedin');

-- CreateEnum
CREATE TYPE "Route" AS ENUM ('new', 'alternate_contact', 'recontact', 'repeat_collaboration');

-- CreateEnum
CREATE TYPE "WorkStage" AS ENUM ('company_review', 'recipient_selection', 'draft_review', 'ready_to_send', 'response_check');

-- CreateEnum
CREATE TYPE "InternalDecision" AS ENUM ('active', 'skipped_for_cycle', 'excluded_permanently');

-- CreateEnum
CREATE TYPE "ResponseResult" AS ENUM ('no_reply', 'discussing', 'rejected', 'deferred', 'referred', 'closed');

-- CreateEnum
CREATE TYPE "ResponseCategory" AS ENUM ('resource_shortage', 'not_interested', 'no_problem_demand', 'other');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('queued', 'sending', 'sent', 'failed', 'unknown');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('cycle_search', 'contact_search', 'draft_generate');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "DraftOrigin" AS ENUM ('ai', 'admin_edit');

-- CreateEnum
CREATE TYPE "CohortStatus" AS ENUM ('acting', 'alumni');

-- CreateEnum
CREATE TYPE "SignupRequestStatus" AS ENUM ('pending', 'verified', 'expired');

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "supabase_user_id" TEXT,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'acting',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people_directory" (
    "id" TEXT NOT NULL,
    "notion_page_id" TEXT NOT NULL,
    "cohort" TEXT NOT NULL,
    "cohort_normalized" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "known_email" TEXT NOT NULL,
    "status" "CohortStatus" NOT NULL,
    "status_raw" TEXT NOT NULL,
    "claimed_by_member_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_directory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_requests" (
    "id" TEXT NOT NULL,
    "person_directory_id" TEXT NOT NULL,
    "desired_email" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "otp_expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "SignupRequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "signup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "started_by_id" TEXT NOT NULL,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_start_intents" (
    "id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "opened_by_id" TEXT NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "cycle_start_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_runs" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "conditions_snapshot" JSONB NOT NULL,
    "triggered_by_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "permanently_excluded" BOOLEAN NOT NULL DEFAULT false,
    "permanently_excluded_reason" TEXT,
    "permanently_excluded_at" TIMESTAMP(3),
    "is_prelaunch_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "department" TEXT,
    "linkedin_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_endpoints" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "channel" "Channel" NOT NULL,
    "address" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prelaunch_contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "linkedin_url" TEXT,
    "note" TEXT,

    CONSTRAINT "prelaunch_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreaches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "current_cycle_id" TEXT NOT NULL,
    "route" "Route" NOT NULL,
    "work_stage" "WorkStage" NOT NULL,
    "internal_decision" "InternalDecision" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "recipient_contact_id" TEXT,
    "recipient_endpoint_id" TEXT,
    "last_sent_cycle_id" TEXT,
    "review_note" TEXT,
    "condition_evidence" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "skip_note" TEXT,
    "skip_cycle_id" TEXT,
    "current_revision" INTEGER,
    "approved_revision" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "route" "Route" NOT NULL,
    "channel" "Channel" NOT NULL,
    "version" INTEGER NOT NULL,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_draft_revisions" (
    "id" TEXT NOT NULL,
    "outreach_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "template_id" TEXT,
    "template_version" INTEGER,
    "created_by" "DraftOrigin" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_draft_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_messages" (
    "id" TEXT NOT NULL,
    "outreach_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "recipient_contact_id" TEXT NOT NULL,
    "recipient_endpoint_id" TEXT NOT NULL,
    "recipient_name_snapshot" TEXT NOT NULL,
    "address_snapshot" TEXT NOT NULL,
    "subject_snapshot" TEXT NOT NULL,
    "body_snapshot" TEXT NOT NULL,
    "template_id" TEXT,
    "template_version" INTEGER,
    "status" "SendStatus" NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" TEXT NOT NULL,
    "outreach_id" TEXT NOT NULL,
    "sent_message_id" TEXT,
    "result" "ResponseResult" NOT NULL,
    "category" "ResponseCategory",
    "explanation" TEXT,
    "revisit_condition" TEXT,
    "checked_by_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "past_projects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "notion_url" TEXT,

    CONSTRAINT "past_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "target_type" TEXT,
    "target_id" TEXT,
    "result_ref" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "actor_member_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_supabase_user_id_key" ON "members"("supabase_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "people_directory_notion_page_id_key" ON "people_directory"("notion_page_id");

-- CreateIndex
CREATE UNIQUE INDEX "people_directory_claimed_by_member_id_key" ON "people_directory"("claimed_by_member_id");

-- CreateIndex
CREATE INDEX "people_directory_cohort_normalized_name_normalized_idx" ON "people_directory"("cohort_normalized", "name_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "search_runs_job_id_key" ON "search_runs"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "outreaches_company_id_key" ON "outreaches"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_draft_revisions_outreach_id_revision_key" ON "message_draft_revisions"("outreach_id", "revision");

-- AddForeignKey
ALTER TABLE "people_directory" ADD CONSTRAINT "people_directory_claimed_by_member_id_fkey" FOREIGN KEY ("claimed_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_person_directory_id_fkey" FOREIGN KEY ("person_directory_id") REFERENCES "people_directory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_start_intents" ADD CONSTRAINT "cycle_start_intents_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_endpoints" ADD CONSTRAINT "contact_endpoints_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_endpoints" ADD CONSTRAINT "contact_endpoints_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prelaunch_contacts" ADD CONSTRAINT "prelaunch_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_current_cycle_id_fkey" FOREIGN KEY ("current_cycle_id") REFERENCES "cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_recipient_contact_id_fkey" FOREIGN KEY ("recipient_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_recipient_endpoint_id_fkey" FOREIGN KEY ("recipient_endpoint_id") REFERENCES "contact_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_last_sent_cycle_id_fkey" FOREIGN KEY ("last_sent_cycle_id") REFERENCES "cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_skip_cycle_id_fkey" FOREIGN KEY ("skip_cycle_id") REFERENCES "cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "outreaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_draft_revisions" ADD CONSTRAINT "message_draft_revisions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_messages" ADD CONSTRAINT "sent_messages_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "outreaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_messages" ADD CONSTRAINT "sent_messages_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_messages" ADD CONSTRAINT "sent_messages_recipient_contact_id_fkey" FOREIGN KEY ("recipient_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_messages" ADD CONSTRAINT "sent_messages_recipient_endpoint_id_fkey" FOREIGN KEY ("recipient_endpoint_id") REFERENCES "contact_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_messages" ADD CONSTRAINT "sent_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "outreaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_sent_message_id_fkey" FOREIGN KEY ("sent_message_id") REFERENCES "sent_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_checked_by_id_fkey" FOREIGN KEY ("checked_by_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "past_projects" ADD CONSTRAINT "past_projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
