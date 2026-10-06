-- 출석체크 벌점 초기화(분기마다). cleared_through까지의 기록은 남기고 합계에서만 뺀다.
CREATE TABLE "nut"."attendance_resets" (
  "id" TEXT NOT NULL,
  "cleared_through" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_resets_pkey" PRIMARY KEY ("id")
);
