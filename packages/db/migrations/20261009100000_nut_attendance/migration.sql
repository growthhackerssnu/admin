-- 출석체크. 예전엔 Slack '출석핑' 워크플로가 내부운영 시트 RollCall·Arrivals 탭에 썼다.
-- 벌점·벌금은 저장하지 않고 type·excuse·minutes_late로 계산한다.
CREATE TABLE "nut"."attendance_records" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "project" TEXT,
  "type" TEXT NOT NULL CHECK ("type" IN ('late', 'absent', 'quest')),
  "excuse" TEXT NOT NULL CHECK ("excuse" IN ('excused', 'partial', 'unexcused')),
  "minutes_late" INTEGER,
  "note" TEXT,
  "source" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attendance_records_date_idx" ON "nut"."attendance_records"("date");
