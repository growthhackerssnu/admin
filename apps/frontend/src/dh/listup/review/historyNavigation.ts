export type HistoryTab = "review" | "contact-history" | "collaboration-history";
export const historyTabs: { value: HistoryTab; label: string }[] = [
  { value: "review", label: "신규 발굴" },
  { value: "contact-history", label: "연락 이력" },
  { value: "collaboration-history", label: "협업 이력" },
];
