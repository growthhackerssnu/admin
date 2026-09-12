-- AlterTable
ALTER TABLE "run_company" ADD CONSTRAINT "run_company_run_id_company_id_key" UNIQUE ("run_id", "company_id");
