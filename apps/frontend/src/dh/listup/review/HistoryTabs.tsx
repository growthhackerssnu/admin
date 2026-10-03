import { Button } from "@/components/ui/button";

export type HistoryTab = "review" | "contact-history" | "collaboration-history";
export const historyTabs: { value: HistoryTab; label: string }[] = [
  { value: "review", label: "신규 발굴" },
  { value: "contact-history", label: "연락 이력" },
  { value: "collaboration-history", label: "협업 이력" },
];
export function HistoryTabs({
  value,
  onChange,
}: {
  value: HistoryTab;
  onChange: (value: HistoryTab) => void;
}) {
  return (
    <nav className="hw-tabs" aria-label="대협 업무">
      {historyTabs.map((tab) => (
        <Button
          key={tab.value}
          variant="ghost"
          aria-current={value === tab.value ? "page" : undefined}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  );
}
