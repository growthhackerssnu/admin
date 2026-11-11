-- AlterTable
ALTER TABLE "dh"."companies" ADD COLUMN     "industry_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "dh"."candidates" ADD COLUMN     "auto_excluded_at" TIMESTAMP(3),
ADD COLUMN     "auto_excluded_category" TEXT,
ADD COLUMN     "auto_excluded_reason" TEXT,
ADD COLUMN     "auto_exclusion_restored_at" TIMESTAMP(3);

