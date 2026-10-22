-- 학회 사업자번호로 세금계산서·지출증빙용 현금영수증을 받았는지. 개인카드·법인계좌이체 지출은
-- 이게 있어야 부가세 매입세액으로 공제된다(법인카드는 카드 전표가 증빙이라 따로 필요 없다).
ALTER TABLE "nut"."claims" ADD COLUMN "tax_invoice" BOOLEAN NOT NULL DEFAULT FALSE;
