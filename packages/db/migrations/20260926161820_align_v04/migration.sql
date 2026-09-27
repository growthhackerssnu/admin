-- v0.4 정렬 — 연락처 테이블 병합, 목표 분기, 필드 모양
--
-- 본문은 prisma migrate diff로 생성한 뒤 앞뒤를 손봤다(conventions §7.3).
--
-- ## 왜 데이터를 지우고 시작하는가
--
-- 이 마이그레이션은 기존 행이 있는 테이블에 NOT NULL 컬럼을 추가한다
-- (outreaches.current_target_quarter_id, search_runs.conditions_snapshot 등).
-- 기본값을 임의로 채우면 "이 컨택 건의 목표 분기가 원래 무엇이었는지"를 서버가
-- 지어내는 셈이라, v0.4 §8.2가 금지한 추정("발송 시각만으로 목표 분기를 추정해
-- 채우지 않는다")에 해당한다.
--
-- 적용 시점의 dh 업무 데이터는 prisma/seed.ts가 만든 픽스처뿐임을 확인했다
-- (기업 11곳 전부 시드 이름과 일치, outreaches 8·sent_messages 3). 그래서 지우고
-- npm run db:seed로 다시 만든다. **core.members는 건드리지 않는다** — 실제 회원
-- 계정이 들어 있고 portal이 소유하는 테이블이다(conventions §5).
--
-- 운영 데이터가 생긴 뒤에 이 마이그레이션을 처음 적용하는 상황이라면 이 DELETE를
-- 그대로 실행하면 안 된다. 그때는 분기·담당자를 사람이 지정하는 백필을 먼저 한다.

-- ---------- 0. dh 업무 데이터 비우기 (core는 제외) ----------
-- candidates ↔ fit_assessments/human_fit_decisions가 서로를 참조해서 순서만으로는
-- 못 푼다. 현재 참조를 먼저 끊는다.
UPDATE "dh"."candidates"
   SET "current_research_id" = NULL,
       "latest_system_assessment_id" = NULL,
       "active_human_decision_id" = NULL;

DELETE FROM "dh"."candidate_contacts";
DELETE FROM "dh"."research_tasks";
DELETE FROM "dh"."intervention_assessments";
DELETE FROM "dh"."fit_assessments";
DELETE FROM "dh"."human_fit_decisions";
DELETE FROM "dh"."candidates";
DELETE FROM "dh"."research_claims";
DELETE FROM "dh"."company_researches";
DELETE FROM "dh"."contact_channels";
DELETE FROM "dh"."company_persons";
DELETE FROM "dh"."evidence";
DELETE FROM "dh"."search_runs";

DELETE FROM "dh"."idempotency_keys";
DELETE FROM "dh"."responses";
DELETE FROM "dh"."sent_messages";
DELETE FROM "dh"."message_draft_revisions";
DELETE FROM "dh"."outreaches";
DELETE FROM "dh"."past_projects";
DELETE FROM "dh"."prelaunch_contacts";
DELETE FROM "dh"."contact_endpoints";
DELETE FROM "dh"."contacts";
DELETE FROM "dh"."companies";
DELETE FROM "dh"."jobs";
DELETE FROM "dh"."quarters";
DELETE FROM "dh"."templates";

-- ---------- 1. 구조 변경 ----------
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "dh"."ResearchTaskTrigger" ADD VALUE 'searchRun';
ALTER TYPE "dh"."ResearchTaskTrigger" ADD VALUE 'userRequest';

-- DropForeignKey
ALTER TABLE "dh"."candidate_contacts" DROP CONSTRAINT "candidate_contacts_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."candidate_contacts" DROP CONSTRAINT "candidate_contacts_contact_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."candidates" DROP CONSTRAINT "candidates_search_run_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."company_persons" DROP CONSTRAINT "company_persons_company_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."company_researches" DROP CONSTRAINT "company_researches_search_run_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."contact_channels" DROP CONSTRAINT "contact_channels_company_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."contact_channels" DROP CONSTRAINT "contact_channels_person_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."outreaches" DROP CONSTRAINT "outreaches_last_sent_quarter_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."outreaches" DROP CONSTRAINT "outreaches_quarter_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."outreaches" DROP CONSTRAINT "outreaches_skip_quarter_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."quarters" DROP CONSTRAINT "quarters_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."search_runs" DROP CONSTRAINT "search_runs_quarter_id_fkey";

-- DropForeignKey
ALTER TABLE "dh"."sent_messages" DROP CONSTRAINT "sent_messages_quarter_id_fkey";

-- DropIndex
DROP INDEX "dh"."candidates_search_run_id_company_id_key";

-- DropIndex
DROP INDEX "dh"."candidates_search_run_id_effective_fit_contact_status_creat_idx";

-- DropIndex
DROP INDEX "dh"."candidates_search_run_id_updated_at_id_idx";

-- DropIndex
DROP INDEX "dh"."companies_aliases_idx";

-- DropIndex
DROP INDEX "dh"."search_runs_quarter_id_created_at_id_idx";

-- AlterTable
ALTER TABLE "dh"."candidates" DROP COLUMN "contact_status",
DROP COLUMN "search_run_id",
ADD COLUMN     "contact_research_status" "dh"."ContactStatus" NOT NULL DEFAULT 'not_started',
ADD COLUMN     "origin_search_run_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "dh"."company_researches" DROP COLUMN "search_run_id",
ADD COLUMN     "origin_search_run_id" TEXT NOT NULL,
ADD COLUMN     "task_id" TEXT;

-- AlterTable
ALTER TABLE "dh"."contact_endpoints" ADD COLUMN     "checked_at" TIMESTAMP(3),
ADD COLUMN     "discovery_method" "dh"."DiscoveryMethod" NOT NULL DEFAULT 'public_source',
ADD COLUMN     "evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "linkedin_methods" "dh"."LinkedinMethod"[],
ADD COLUMN     "owner_type" "dh"."ChannelOwnerType" NOT NULL DEFAULT 'person',
ADD COLUMN     "ownership_status" "dh"."OwnershipStatus" NOT NULL DEFAULT 'uncertain',
ADD COLUMN     "reachability_status" "dh"."ReachabilityStatus" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "validation_status" "dh"."ValidationStatus" NOT NULL DEFAULT 'not_checked';

-- AlterTable
ALTER TABLE "dh"."contacts" ADD COLUMN     "employment_checked_at" TIMESTAMP(3),
ADD COLUMN     "employment_status" "dh"."EmploymentStatus" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "job_function" "dh"."JobFunction" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "role" TEXT,
ADD COLUMN     "seniority" "dh"."Seniority" NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "dh"."evidence" DROP COLUMN "source_name",
DROP COLUMN "source_type",
ADD COLUMN     "source_key" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "dh"."fit_assessments" DROP COLUMN "information_gaps",
ADD COLUMN     "information_gaps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "dh"."intervention_assessments" DROP COLUMN "feasibility_evidence_ids",
DROP COLUMN "feasibility_rationale",
DROP COLUMN "feasibility_verdict",
DROP COLUMN "required_conditions",
DROP COLUMN "value_rationale",
ADD COLUMN     "possibility_evidence_ids" TEXT[],
ADD COLUMN     "possibility_reason" TEXT NOT NULL,
ADD COLUMN     "possibility_verdict" "dh"."CriterionVerdict" NOT NULL,
ADD COLUMN     "prerequisites" TEXT[],
ADD COLUMN     "value_reason" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "dh"."outreaches" DROP COLUMN "quarter_id",
ADD COLUMN     "current_draft_revision" INTEGER,
ADD COLUMN     "current_target_quarter_id" TEXT NOT NULL,
ADD COLUMN     "origin_search_run_id" TEXT,
ADD COLUMN     "selected_channel" "dh"."Channel",
ADD COLUMN     "selection_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "dh"."research_tasks" ADD COLUMN     "job_id" TEXT;

-- AlterTable
ALTER TABLE "dh"."search_runs" DROP COLUMN "filters",
DROP COLUMN "limits",
DROP COLUMN "quarter_id",
DROP COLUMN "source_policy",
DROP COLUMN "sources",
ADD COLUMN     "assigned_member_id" TEXT NOT NULL,
ADD COLUMN     "conditions_snapshot" JSONB NOT NULL,
ADD COLUMN     "finish_reason" TEXT,
ADD COLUMN     "target_quarter_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "dh"."sent_messages" DROP COLUMN "quarter_id",
ADD COLUMN     "target_quarter_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "dh"."candidate_contacts";

-- DropTable
DROP TABLE "dh"."company_persons";

-- DropTable
DROP TABLE "dh"."contact_channels";

-- DropTable
DROP TABLE "dh"."quarters";

-- DropEnum
DROP TYPE "dh"."ContactPriority";

-- DropEnum
DROP TYPE "dh"."EvidenceSourceType";

-- DropEnum
DROP TYPE "dh"."ResolutionMethod";

-- DropEnum
DROP TYPE "dh"."SearchSourcePolicy";

-- CreateTable
CREATE TABLE "dh"."target_quarters" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_quarters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."outreach_target_quarter_changes" (
    "id" TEXT NOT NULL,
    "outreach_id" TEXT NOT NULL,
    "from_target_quarter_id" TEXT NOT NULL,
    "to_target_quarter_id" TEXT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "outreach_target_quarter_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dh"."contact_option_assessments" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "status" "dh"."CandidateContactStatus" NOT NULL,
    "role_relevance" TEXT,
    "decision_authority" "dh"."DecisionAuthority" NOT NULL DEFAULT 'unknown',
    "reason" TEXT,
    "source_url" TEXT,
    "confirmed_by_id" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_option_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_quarters_year_quarter_idx" ON "dh"."target_quarters"("year" DESC, "quarter" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "target_quarters_year_quarter_key" ON "dh"."target_quarters"("year", "quarter");

-- CreateIndex
CREATE INDEX "outreach_target_quarter_changes_outreach_id_changed_at_idx" ON "dh"."outreach_target_quarter_changes"("outreach_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "contact_option_assessments_candidate_id_status_checked_at_i_idx" ON "dh"."contact_option_assessments"("candidate_id", "status", "checked_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "contact_option_assessments_candidate_id_endpoint_id_key" ON "dh"."contact_option_assessments"("candidate_id", "endpoint_id");

-- CreateIndex
CREATE INDEX "candidates_origin_search_run_id_effective_fit_contact_resea_idx" ON "dh"."candidates"("origin_search_run_id", "effective_fit", "contact_research_status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "candidates_origin_search_run_id_updated_at_id_idx" ON "dh"."candidates"("origin_search_run_id", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candidates_company_id_key" ON "dh"."candidates"("company_id");

-- CreateIndex
CREATE INDEX "contact_endpoints_company_id_idx" ON "dh"."contact_endpoints"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_endpoints_company_id_channel_address_key" ON "dh"."contact_endpoints"("company_id", "channel", "address");

-- CreateIndex
CREATE INDEX "contacts_company_id_idx" ON "dh"."contacts"("company_id");

-- CreateIndex
CREATE INDEX "outreaches_current_target_quarter_id_created_at_id_idx" ON "dh"."outreaches"("current_target_quarter_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "search_runs_target_quarter_id_created_at_id_idx" ON "dh"."search_runs"("target_quarter_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "dh"."outreach_target_quarter_changes" ADD CONSTRAINT "outreach_target_quarter_changes_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "dh"."outreaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreach_target_quarter_changes" ADD CONSTRAINT "outreach_target_quarter_changes_from_target_quarter_id_fkey" FOREIGN KEY ("from_target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreach_target_quarter_changes" ADD CONSTRAINT "outreach_target_quarter_changes_to_target_quarter_id_fkey" FOREIGN KEY ("to_target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreach_target_quarter_changes" ADD CONSTRAINT "outreach_target_quarter_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreaches" ADD CONSTRAINT "outreaches_current_target_quarter_id_fkey" FOREIGN KEY ("current_target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreaches" ADD CONSTRAINT "outreaches_last_sent_quarter_id_fkey" FOREIGN KEY ("last_sent_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreaches" ADD CONSTRAINT "outreaches_skip_quarter_id_fkey" FOREIGN KEY ("skip_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."outreaches" ADD CONSTRAINT "outreaches_origin_search_run_id_fkey" FOREIGN KEY ("origin_search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."sent_messages" ADD CONSTRAINT "sent_messages_target_quarter_id_fkey" FOREIGN KEY ("target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_target_quarter_id_fkey" FOREIGN KEY ("target_quarter_id") REFERENCES "dh"."target_quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."search_runs" ADD CONSTRAINT "search_runs_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."company_researches" ADD CONSTRAINT "company_researches_origin_search_run_id_fkey" FOREIGN KEY ("origin_search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."candidates" ADD CONSTRAINT "candidates_origin_search_run_id_fkey" FOREIGN KEY ("origin_search_run_id") REFERENCES "dh"."search_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."contact_option_assessments" ADD CONSTRAINT "contact_option_assessments_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."contact_option_assessments" ADD CONSTRAINT "contact_option_assessments_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "dh"."contact_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."contact_option_assessments" ADD CONSTRAINT "contact_option_assessments_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------- 2. RLS (기본 거부) ----------
-- 테이블 생성 절차의 일부다(conventions §9.1). 정책은 만들지 않는다.
ALTER TABLE "dh"."target_quarters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."outreach_target_quarter_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."contact_option_assessments" ENABLE ROW LEVEL SECURITY;
