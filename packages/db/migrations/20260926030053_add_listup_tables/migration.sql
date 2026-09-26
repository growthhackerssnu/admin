-- 리스트업(기업 발견·판단·연락처) 테이블 12개 추가
--
-- 본문은 prisma migrate diff로 생성한 뒤 두 가지를 손봤다(conventions §7.3).
--   1) 생성문이 포함하던 `DROP INDEX dh.companies_aliases_idx`를 뺐다. 이 GIN 인덱스는
--      Prisma 스키마로 표현할 수 없어서 앞 마이그레이션에서 직접 만든 것이다. 앞으로도
--      migrate diff는 이 인덱스를 지우려 하니, 생성문을 그대로 붙여넣지 말 것.
--   2) 맨 끝에 신규 테이블 12개의 RLS 활성화를 더했다 — 테이블 생성 절차의 일부다(§9.1).
--
-- 명세의 workspace_id는 도입하지 않는다(GH SNU 단일 조직).

-- CreateEnum
CREATE TYPE "dh"."SearchSourcePolicy" AS ENUM ('selected_only', 'allow_supplementary');

-- CreateEnum
CREATE TYPE "dh"."SearchRunStatus" AS ENUM ('queued', 'running', 'completed', 'partially_completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "dh"."EvidenceSourceType" AS ENUM ('official', 'company_database', 'news', 'newsletter', 'linkedin', 'other');

-- CreateEnum
CREATE TYPE "dh"."ClaimCategory" AS ENUM ('product_service', 'target_customer', 'revenue_model', 'user_journey', 'operations', 'recent_change', 'public_challenge');

-- CreateEnum
CREATE TYPE "dh"."ClaimBasis" AS ENUM ('reported_fact', 'inference');

-- CreateEnum
CREATE TYPE "dh"."FitVerdict" AS ENUM ('fit', 'unfit', 'pending');

-- CreateEnum
CREATE TYPE "dh"."ContactStatus" AS ENUM ('not_started', 'searching', 'available', 'needs_verification', 'not_found');

-- CreateEnum
CREATE TYPE "dh"."CriterionVerdict" AS ENUM ('supported', 'unsupported', 'unknown');

-- CreateEnum
CREATE TYPE "dh"."ResolutionMethod" AS ENUM ('public_research', 'company_confirmation');

-- CreateEnum
CREATE TYPE "dh"."JobFunction" AS ENUM ('executive', 'business_development', 'product', 'data', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "dh"."Seniority" AS ENUM ('c_level', 'manager', 'individual_contributor', 'unknown');

-- CreateEnum
CREATE TYPE "dh"."EmploymentStatus" AS ENUM ('current', 'former', 'unknown');

-- CreateEnum
CREATE TYPE "dh"."ChannelOwnerType" AS ENUM ('person', 'team', 'company');

-- CreateEnum
CREATE TYPE "dh"."DiscoveryMethod" AS ENUM ('public_source', 'user_provided', 'inferred');

-- CreateEnum
CREATE TYPE "dh"."OwnershipStatus" AS ENUM ('supported', 'uncertain', 'contradicted');

-- CreateEnum
CREATE TYPE "dh"."ValidationStatus" AS ENUM ('not_checked', 'valid_format', 'invalid');

-- CreateEnum
CREATE TYPE "dh"."ReachabilityStatus" AS ENUM ('unknown', 'confirmed', 'unavailable');

-- CreateEnum
CREATE TYPE "dh"."LinkedinMethod" AS ENUM ('connection_request', 'direct_message', 'inmail');

-- CreateEnum
CREATE TYPE "dh"."CandidateContactStatus" AS ENUM ('usable', 'needs_verification', 'unusable');

-- CreateEnum
CREATE TYPE "dh"."ContactPriority" AS ENUM ('preferred', 'alternative');

-- CreateEnum
CREATE TYPE "dh"."DecisionAuthority" AS ENUM ('supported', 'unknown');

-- CreateEnum
CREATE TYPE "dh"."ResearchTaskType" AS ENUM ('company_discovery', 'company_research', 'fit_assessment', 'contact_research', 'contact_verification');

-- CreateEnum
CREATE TYPE "dh"."ResearchTaskTrigger" AS ENUM ('initial', 'auto_followup', 'human_request', 'fit_changed');

-- CreateEnum
CREATE TYPE "dh"."FollowupPolicy" AS ENUM ('automatic', 'none');

-- CreateEnum
CREATE TYPE "dh"."ResearchTaskStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');


-- AlterTable
ALTER TABLE "dh"."companies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "dh"."search_runs" (
    "id" TEXT NOT NULL,
    "quarter_id" TEXT NOT NULL,
    "source_policy" "dh"."SearchSourcePolicy" NOT NULL,
    "sources" JSONB NOT NULL,
    "filters" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "status" "dh"."SearchRunStatus" NOT NULL DEFAULT 'queued',
    "duplicate_excluded_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "search_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."evidence" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "search_run_id" TEXT,
    "url" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_type" "dh"."EvidenceSourceType" NOT NULL,
    "title" TEXT,
    "excerpt" TEXT,
    "published_at" TIMESTAMP(3),
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."company_researches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "search_run_id" TEXT NOT NULL,
    "missing_information" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_researches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."research_claims" (
    "id" TEXT NOT NULL,
    "research_id" TEXT NOT NULL,
    "category" "dh"."ClaimCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "basis" "dh"."ClaimBasis" NOT NULL,
    "evidence_ids" TEXT[],

    CONSTRAINT "research_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."candidates" (
    "id" TEXT NOT NULL,
    "search_run_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "discovery_evidence_ids" TEXT[],
    "current_research_id" TEXT,
    "latest_system_assessment_id" TEXT,
    "active_human_decision_id" TEXT,
    "effective_fit" "dh"."FitVerdict",
    "contact_status" "dh"."ContactStatus" NOT NULL DEFAULT 'not_started',
    "usable_contact_count" INTEGER NOT NULL DEFAULT 0,
    "needs_verification_contact_count" INTEGER NOT NULL DEFAULT 0,
    "unusable_contact_count" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."fit_assessments" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "research_id" TEXT NOT NULL,
    "verdict" "dh"."FitVerdict" NOT NULL,
    "summary" TEXT NOT NULL,
    "information_gaps" JSONB NOT NULL DEFAULT '[]',
    "criteria_version" TEXT NOT NULL,
    "model_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fit_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."intervention_assessments" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "feasibility_verdict" "dh"."CriterionVerdict" NOT NULL,
    "feasibility_rationale" TEXT NOT NULL,
    "feasibility_evidence_ids" TEXT[],
    "required_conditions" TEXT[],
    "value_verdict" "dh"."CriterionVerdict" NOT NULL,
    "value_rationale" TEXT NOT NULL,
    "value_evidence_ids" TEXT[],
    "target_business_outcome" TEXT NOT NULL,

    CONSTRAINT "intervention_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."human_fit_decisions" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "verdict" "dh"."FitVerdict" NOT NULL,
    "reason" TEXT,
    "intervention_note" TEXT,
    "based_on_assessment_id" TEXT,
    "decided_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "human_fit_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."company_persons" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_title" TEXT,
    "job_function" "dh"."JobFunction" NOT NULL DEFAULT 'unknown',
    "seniority" "dh"."Seniority" NOT NULL DEFAULT 'unknown',
    "employment_status" "dh"."EmploymentStatus" NOT NULL DEFAULT 'unknown',
    "employment_evidence_ids" TEXT[],
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."contact_channels" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "person_id" TEXT,
    "type" "dh"."Channel" NOT NULL,
    "value" TEXT NOT NULL,
    "owner_type" "dh"."ChannelOwnerType" NOT NULL,
    "discovery_method" "dh"."DiscoveryMethod" NOT NULL,
    "ownership_status" "dh"."OwnershipStatus" NOT NULL,
    "validation_status" "dh"."ValidationStatus" NOT NULL DEFAULT 'not_checked',
    "reachability_status" "dh"."ReachabilityStatus" NOT NULL DEFAULT 'unknown',
    "linkedin_methods" "dh"."LinkedinMethod"[],
    "evidence_ids" TEXT[],
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."candidate_contacts" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "contact_channel_id" TEXT NOT NULL,
    "status" "dh"."CandidateContactStatus" NOT NULL,
    "priority" "dh"."ContactPriority" NOT NULL DEFAULT 'alternative',
    "role_relevance" TEXT,
    "decision_authority" "dh"."DecisionAuthority" NOT NULL DEFAULT 'unknown',
    "reason" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."research_tasks" (
    "id" TEXT NOT NULL,
    "search_run_id" TEXT NOT NULL,
    "candidate_id" TEXT,
    "parent_task_id" TEXT,
    "type" "dh"."ResearchTaskType" NOT NULL,
    "trigger" "dh"."ResearchTaskTrigger" NOT NULL,
    "requested_information" TEXT[],
    "followup_policy" "dh"."FollowupPolicy" NOT NULL,
    "status" "dh"."ResearchTaskStatus" NOT NULL DEFAULT 'queued',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "result_refs" JSONB NOT NULL DEFAULT '[]',
    "error_code" TEXT,
    "error_message" TEXT,
    "error_retryable" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "research_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_runs_status_created_at_id_idx" ON "dh"."search_runs"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "search_runs_quarter_id_created_at_id_idx" ON "dh"."search_runs"("quarter_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "evidence_company_id_retrieved_at_idx" ON "dh"."evidence"("company_id", "retrieved_at" DESC);

-- CreateIndex
CREATE INDEX "company_researches_company_id_created_at_idx" ON "dh"."company_researches"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "research_claims_research_id_idx" ON "dh"."research_claims"("research_id");

-- CreateIndex
CREATE INDEX "candidates_search_run_id_effective_fit_contact_status_creat_idx" ON "dh"."candidates"("search_run_id", "effective_fit", "contact_status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "candidates_search_run_id_updated_at_id_idx" ON "dh"."candidates"("search_run_id", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "candidates_company_id_idx" ON "dh"."candidates"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_search_run_id_company_id_key" ON "dh"."candidates"("search_run_id", "company_id");

-- CreateIndex
CREATE INDEX "fit_assessments_candidate_id_created_at_idx" ON "dh"."fit_assessments"("candidate_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "intervention_assessments_assessment_id_idx" ON "dh"."intervention_assessments"("assessment_id");

-- CreateIndex
CREATE INDEX "human_fit_decisions_candidate_id_created_at_idx" ON "dh"."human_fit_decisions"("candidate_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "company_persons_company_id_idx" ON "dh"."company_persons"("company_id");

-- CreateIndex
CREATE INDEX "contact_channels_company_id_idx" ON "dh"."contact_channels"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_channels_company_id_type_value_key" ON "dh"."contact_channels"("company_id", "type", "value");

-- CreateIndex
CREATE INDEX "candidate_contacts_candidate_id_priority_checked_at_id_idx" ON "dh"."candidate_contacts"("candidate_id", "priority", "checked_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_contacts_candidate_id_contact_channel_id_key" ON "dh"."candidate_contacts"("candidate_id", "contact_channel_id");

-- CreateIndex
CREATE INDEX "research_tasks_candidate_id_type_status_idx" ON "dh"."research_tasks"("candidate_id", "type", "status");

-- CreateIndex
CREATE INDEX "research_tasks_search_run_id_status_idx" ON "dh"."research_tasks"("search_run_id", "status");

-- CreateIndex
CREATE INDEX "research_tasks_status_created_at_id_idx" ON "dh"."research_tasks"("status", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_quarter_id_fkey" FOREIGN KEY ("quarter_id") REFERENCES "dh"."quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."evidence" ADD CONSTRAINT "evidence_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "dh"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."evidence" ADD CONSTRAINT "evidence_search_run_id_fkey" FOREIGN KEY ("search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."company_researches" ADD CONSTRAINT "company_researches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "dh"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."company_researches" ADD CONSTRAINT "company_researches_search_run_id_fkey" FOREIGN KEY ("search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."research_claims" ADD CONSTRAINT "research_claims_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "dh"."company_researches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_search_run_id_fkey" FOREIGN KEY ("search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "dh"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_current_research_id_fkey" FOREIGN KEY ("current_research_id") REFERENCES "dh"."company_researches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_latest_system_assessment_id_fkey" FOREIGN KEY ("latest_system_assessment_id") REFERENCES "dh"."fit_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_active_human_decision_id_fkey" FOREIGN KEY ("active_human_decision_id") REFERENCES "dh"."human_fit_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."fit_assessments" ADD CONSTRAINT "fit_assessments_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."fit_assessments" ADD CONSTRAINT "fit_assessments_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "dh"."company_researches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."intervention_assessments" ADD CONSTRAINT "intervention_assessments_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "dh"."fit_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."human_fit_decisions" ADD CONSTRAINT "human_fit_decisions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."human_fit_decisions" ADD CONSTRAINT "human_fit_decisions_based_on_assessment_id_fkey" FOREIGN KEY ("based_on_assessment_id") REFERENCES "dh"."fit_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."human_fit_decisions" ADD CONSTRAINT "human_fit_decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."company_persons" ADD CONSTRAINT "company_persons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "dh"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."contact_channels" ADD CONSTRAINT "contact_channels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "dh"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."contact_channels" ADD CONSTRAINT "contact_channels_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "dh"."company_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidate_contacts" ADD CONSTRAINT "candidate_contacts_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidate_contacts" ADD CONSTRAINT "candidate_contacts_contact_channel_id_fkey" FOREIGN KEY ("contact_channel_id") REFERENCES "dh"."contact_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."research_tasks" ADD CONSTRAINT "research_tasks_search_run_id_fkey" FOREIGN KEY ("search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."research_tasks" ADD CONSTRAINT "research_tasks_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."research_tasks" ADD CONSTRAINT "research_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "dh"."research_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------- RLS (기본 거부) ----------
-- 20260923052424_enable_rls와 같은 이유·같은 방식이다. 정책은 만들지 않는다 —
-- RLS를 켜면 기본이 전부 거부이고, 프론트에 직접 열 때 그 테이블/뷰에만 정책을 붙인다.
ALTER TABLE "dh"."search_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."company_researches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."research_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."fit_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."intervention_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."human_fit_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."company_persons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."contact_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."candidate_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."research_tasks" ENABLE ROW LEVEL SECURITY;
