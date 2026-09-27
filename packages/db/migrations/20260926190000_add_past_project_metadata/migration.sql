-- 과거 협업 프로젝트를 Notion 프로젝트 DB와 연결하기 위한 메타데이터를 추가한다.
-- 기존 past_projects 행은 Notion page id/분기 정보가 없을 수 있으므로
-- 초기 마이그레이션에서는 모두 nullable로 두고 importer가 신규 행부터 채운다.

ALTER TABLE "dh"."past_projects"
  ADD COLUMN "notion_page_id" TEXT,
  ADD COLUMN "year" INTEGER,
  ADD COLUMN "quarter" INTEGER,
  ADD COLUMN "technology_category" TEXT,
  ADD COLUMN "industry_category" TEXT;

CREATE UNIQUE INDEX "past_projects_notion_page_id_key"
  ON "dh"."past_projects"("notion_page_id");

CREATE INDEX "past_projects_company_id_year_quarter_idx"
  ON "dh"."past_projects"("company_id", "year", "quarter");
