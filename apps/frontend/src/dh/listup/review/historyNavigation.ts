export type HistoryTab = "review" | "contact-history" | "collaboration-history";
export const historyTabs: { value: HistoryTab; label: string }[] = [
  { value: "review", label: "신규 발굴" },
  { value: "contact-history", label: "과거 컨택" },
  { value: "collaboration-history", label: "재수주" },
];
