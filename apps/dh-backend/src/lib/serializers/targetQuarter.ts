import type { TargetQuarter } from "@/generated/prisma";

// 목표 분기는 "언제 추진할지"의 라벨이다. 실제 발송 시기가 아니며, 분기 실적은
// sent_messages.sentAt을 한국 달력 분기로 변환해 따로 센다(P-15).
export function serializeTargetQuarter(quarter: TargetQuarter) {
  return {
    id: quarter.id,
    year: quarter.year,
    quarter: quarter.quarter,
  };
}
