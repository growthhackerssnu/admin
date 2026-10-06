-- 출석체크 벌점·벌금 기준을 반기마다 바꿀 수 있게 한다. 행이 없으면 코드의 기본값(벌점벌금 시트)을 쓴다.
CREATE TABLE "nut"."attendance_settings" (
  "period_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" INTEGER NOT NULL CHECK ("value" >= 0),
  CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("period_id", "key")
);
