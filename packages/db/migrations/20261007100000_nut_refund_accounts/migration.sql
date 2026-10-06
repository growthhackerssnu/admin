-- 회원 환급 계좌. 청구서 계좌 자동 채우기용. 이메일은 소문자로 저장한다.
CREATE TABLE "nut"."refund_accounts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cohort" TEXT,
  "email" TEXT,
  "bank_account" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refund_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refund_accounts_email_key" ON "nut"."refund_accounts"("email");
CREATE INDEX "refund_accounts_name_idx" ON "nut"."refund_accounts"("name");
