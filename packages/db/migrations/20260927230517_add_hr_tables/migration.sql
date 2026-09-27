-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "hr";

-- CreateEnum
CREATE TYPE "hr"."EditRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "hr"."edit_requests" (
    "id" TEXT NOT NULL,
    "notion_page_id" TEXT NOT NULL,
    "requester_member_id" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "status" "hr"."EditRequestStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_member_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."people_cache" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "edit_requests_status_submitted_at_idx" ON "hr"."edit_requests"("status", "submitted_at" DESC);

-- AddForeignKey
ALTER TABLE "hr"."edit_requests" ADD CONSTRAINT "edit_requests_requester_member_id_fkey" FOREIGN KEY ("requester_member_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."edit_requests" ADD CONSTRAINT "edit_requests_reviewed_by_member_id_fkey" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Enable RLS (docs/db/conventions.md §6.2, DB_SCHEMA_HR.md §4) — 프론트 직접
-- 노출 계획이 없어도 새 테이블은 만들 때 바로 켜둔다. 정책(policy)은 아직
-- 없다(=postgres 계정 외 전부 거부, hr-backend는 postgres로 접속하므로 영향 없음).
ALTER TABLE "hr"."edit_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr"."people_cache" ENABLE ROW LEVEL SECURITY;
