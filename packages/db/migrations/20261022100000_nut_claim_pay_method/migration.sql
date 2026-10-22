-- 결제 수단을 법인카드 / 개인카드 / 법인계좌이체 셋으로 나눈다.
-- 기존 prepaid(true = 개인이 먼저 내고 돌려받음)는 배포 중 옛 코드가 읽을 수 있게 남기고, 새 코드가 함께 맞춘다.
ALTER TABLE "nut"."claims" ADD COLUMN "pay_method" TEXT NOT NULL DEFAULT 'biz_card';
UPDATE "nut"."claims" SET "pay_method" = 'personal_card' WHERE "prepaid";
