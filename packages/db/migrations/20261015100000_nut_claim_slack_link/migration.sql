-- 청구서의 Slack 스레드 링크. 개인 카드 청구서는 영수증이 그 스레드에 있어서, 세금 신고 때 찾아본다.
-- 법인카드 여부는 기존 prepaid 칸을 쓴다(true = 개인이 먼저 내고 돌려받음, false = 법인카드).
ALTER TABLE "nut"."claims" ADD COLUMN "slack_link" TEXT;
