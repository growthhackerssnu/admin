-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'SOURCING', 'AWAITING_COMPANY_APPROVAL', 'RESEARCHING_CONTACTS', 'AWAITING_CONTACT_APPROVAL', 'DRAFTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunCompanyStatus" AS ENUM ('CANDIDATE', 'APPROVED', 'REJECTED', 'RESEARCHING', 'CONTACTS_READY', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "DecisionAction" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'DORMANT', 'SHUT_DOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CooldownClass" AS ENUM ('PERMANENT_DISQUALIFY', 'COOLDOWN_ELIGIBLE');

-- CreateEnum
CREATE TYPE "ResearchStage" AS ENUM ('COMPANY_SOURCING', 'COMPANY_DETAIL', 'CONTACT_DISCOVERY', 'CONTACT_PRERESEARCH');

-- CreateEnum
CREATE TYPE "ResearchAttemptStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('COMPANY', 'CONTACT');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('DECISION_MAKER', 'PRACTITIONER', 'CHAMPION');

-- CreateEnum
CREATE TYPE "ContactCandidateStatus" AS ENUM ('PROPOSED', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContactMethodType" AS ENUM ('EMAIL', 'PHONE', 'LINKEDIN', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageDraftStatus" AS ENUM ('SKELETON', 'AWAITING_PROPOSAL', 'IN_REVIEW', 'FINALIZED', 'SENT');

-- CreateEnum
CREATE TYPE "ExceptionQueueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SourceFeedType" AS ENUM ('RSS', 'NEWS_API', 'JOB_BOARD', 'VC_PORTFOLIO');

-- CreateTable
CREATE TABLE "workflow_config" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "funding_stage" TEXT NOT NULL,
    "headcount_min" INTEGER NOT NULL,
    "headcount_max" INTEGER NOT NULL,
    "target_company_count" INTEGER NOT NULL,
    "company_retry_limit" INTEGER NOT NULL,
    "contact_retry_limit" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_run" (
    "id" UUID NOT NULL,
    "config_id" UUID NOT NULL,
    "criteria_snapshot" JSONB NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domain" TEXT NOT NULL,
    "industry" TEXT,
    "funding_stage" TEXT,
    "employee_count" INTEGER,
    "status" "CompanyStatus" NOT NULL DEFAULT 'UNKNOWN',
    "checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_company" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fit_score" DOUBLE PRECISION,
    "recommendation_reason" TEXT,
    "uncertainty" TEXT,
    "status" "RunCompanyStatus" NOT NULL DEFAULT 'CANDIDATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_decision" (
    "id" UUID NOT NULL,
    "run_company_id" UUID NOT NULL,
    "action" "DecisionAction" NOT NULL,
    "rejection_reason" TEXT,
    "cooldown_class" "CooldownClass",
    "cooldown_until" TIMESTAMP(3),
    "decided_by" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_attempt" (
    "id" UUID NOT NULL,
    "run_company_id" UUID NOT NULL,
    "stage" "ResearchStage" NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "search_strategy" TEXT,
    "status" "ResearchAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "research_attempt_id" UUID NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "fact_key" TEXT NOT NULL,
    "fact_value" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "job_title" TEXT,
    "profile_url" TEXT,
    "checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_candidate" (
    "id" UUID NOT NULL,
    "research_attempt_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "role_type" "RoleType" NOT NULL,
    "role_fit_score" DOUBLE PRECISION,
    "contactability_score" DOUBLE PRECISION,
    "recommendation_reason" TEXT,
    "status" "ContactCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_method" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "type" "ContactMethodType" NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source_url" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_decision" (
    "id" UUID NOT NULL,
    "contact_candidate_id" UUID NOT NULL,
    "action" "DecisionAction" NOT NULL,
    "rejection_reason" TEXT,
    "decided_by" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_draft" (
    "id" UUID NOT NULL,
    "run_company_id" UUID NOT NULL,
    "contact_candidate_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "research_summary" TEXT,
    "problem_hypothesis" TEXT,
    "proposal_input" TEXT,
    "body" TEXT,
    "status" "MessageDraftStatus" NOT NULL DEFAULT 'SKELETON',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_queue" (
    "id" UUID NOT NULL,
    "run_company_id" UUID,
    "contact_candidate_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "ExceptionQueueStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "resolution_note" TEXT,

    CONSTRAINT "exception_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_feed" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "SourceFeedType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_feed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_domain_key" ON "company"("domain");

-- CreateIndex
CREATE INDEX "evidence_subject_type_subject_id_fact_key_idx" ON "evidence"("subject_type", "subject_id", "fact_key");

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "workflow_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_company" ADD CONSTRAINT "run_company_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_company" ADD CONSTRAINT "run_company_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_decision" ADD CONSTRAINT "company_decision_run_company_id_fkey" FOREIGN KEY ("run_company_id") REFERENCES "run_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_attempt" ADD CONSTRAINT "research_attempt_run_company_id_fkey" FOREIGN KEY ("run_company_id") REFERENCES "run_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_research_attempt_id_fkey" FOREIGN KEY ("research_attempt_id") REFERENCES "research_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_candidate" ADD CONSTRAINT "contact_candidate_research_attempt_id_fkey" FOREIGN KEY ("research_attempt_id") REFERENCES "research_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_candidate" ADD CONSTRAINT "contact_candidate_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_method" ADD CONSTRAINT "contact_method_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_decision" ADD CONSTRAINT "contact_decision_contact_candidate_id_fkey" FOREIGN KEY ("contact_candidate_id") REFERENCES "contact_candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_draft" ADD CONSTRAINT "message_draft_run_company_id_fkey" FOREIGN KEY ("run_company_id") REFERENCES "run_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_draft" ADD CONSTRAINT "message_draft_contact_candidate_id_fkey" FOREIGN KEY ("contact_candidate_id") REFERENCES "contact_candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_queue" ADD CONSTRAINT "exception_queue_run_company_id_fkey" FOREIGN KEY ("run_company_id") REFERENCES "run_company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_queue" ADD CONSTRAINT "exception_queue_contact_candidate_id_fkey" FOREIGN KEY ("contact_candidate_id") REFERENCES "contact_candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
