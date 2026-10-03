-- past_projects: 팀장·관리자가 직접 등록·수정하는 협업 프로젝트 정보.
--
-- 기존 행은 상태(status)·담당자·수주 출처를 모두 NULL로 둔다. 확인되지 않은 과거
-- 프로젝트를 완료로 간주하지 않기 위해서다. created_at/updated_at은 "시스템이 이 행을
-- 기록한 시각"이며 과거 프로젝트가 진행된 시기가 아니다.
--
-- updated_at은 Prisma의 @updatedAt이라 DB 기본값이 없어야 drift가 생기지 않는다. 기존
-- 행을 채우려고 기본값을 달아 컬럼을 추가한 뒤 바로 기본값을 제거한다.

-- CreateEnum
CREATE TYPE "dh"."ProjectStatus" AS ENUM ('won', 'in_progress', 'completed');

-- AlterTable
ALTER TABLE "dh"."past_projects" ADD COLUMN     "contact_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "result_url" TEXT,
ADD COLUMN     "source_outreach_id" TEXT,
ADD COLUMN     "status" "dh"."ProjectStatus",
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "dh"."past_projects" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "past_projects_source_outreach_id_key" ON "dh"."past_projects"("source_outreach_id");

-- AddForeignKey
ALTER TABLE "dh"."past_projects" ADD CONSTRAINT "past_projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."past_projects" ADD CONSTRAINT "past_projects_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "dh"."contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."past_projects" ADD CONSTRAINT "past_projects_source_outreach_id_fkey" FOREIGN KEY ("source_outreach_id") REFERENCES "dh"."outreaches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."past_projects" ADD CONSTRAINT "past_projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dh"."past_projects" ADD CONSTRAINT "past_projects_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
