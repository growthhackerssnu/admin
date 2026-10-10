-- 지각 구간을 회장단이 직접 고른 값. 비어 있으면 지각 분 ÷ 세션 길이로 자동으로 정한다(세션 길이가 그날만 다를 때 쓴다).
ALTER TABLE "nut"."attendance_records" ADD COLUMN "tier" TEXT;
