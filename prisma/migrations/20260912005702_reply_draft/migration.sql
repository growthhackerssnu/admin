-- CreateEnum
CREATE TYPE "ReplyIntent" AS ENUM ('INTERESTED', 'NEEDS_INFO', 'DECLINED', 'OUT_OF_OFFICE', 'WRONG_PERSON', 'OTHER');

-- CreateTable
CREATE TABLE "reply_draft" (
    "id" UUID NOT NULL,
    "contact_candidate_id" UUID NOT NULL,
    "incoming_text" TEXT NOT NULL,
    "classified_intent" "ReplyIntent" NOT NULL,
    "draft_body" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_draft_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reply_draft" ADD CONSTRAINT "reply_draft_contact_candidate_id_fkey" FOREIGN KEY ("contact_candidate_id") REFERENCES "contact_candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
