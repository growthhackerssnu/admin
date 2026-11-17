-- 발송 뒤 "답이 왔고 논의 중"인 상태를 기록할 수 있게 한다. 기존 데이터는 바꾸지 않는다.

-- AlterEnum
ALTER TYPE "dh"."OutcomeStatus" ADD VALUE 'in_discussion' AFTER 'pending';

-- AlterTable
ALTER TABLE "dh"."outreach_outcome_events" ADD COLUMN     "revisit_condition" TEXT;
