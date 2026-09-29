// 승인 큐(§12.4)와 내 수정 요청(§12.5) 둘 다 쓸 순수 표시 로직. diff 구조는
// DB_SCHEMA_HR.md §1.1, key 컨벤션은 apps/backend/src/hr/lib/editRequests.ts와 반드시
// 같아야 한다.
import type { EditRequest } from "./api";

const SECTION_LABEL: Record<string, string> = {
  careers: "Careers",
  activities: "Activities",
  projects: "Projects",
};

export function sectionLabel(key: string): string {
  return SECTION_LABEL[key] ?? key;
}

export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "(없음)";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "(없음)";
  const text = String(value);
  return text.trim() === "" ? "(없음)" : text;
}

// 테이블 목록의 "변경 항목" 컬럼(§12.4 예시: "이메일, LinkedIn 외 2건").
export function summarizeDiff(diff: EditRequest["diff"]): string {
  const labels = [
    ...Object.keys(diff.structuredFields),
    ...Object.keys(diff.freeTextSections).map(sectionLabel),
  ];
  if (labels.length === 0) return "-";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} 외 ${labels.length - 2}건`;
}
