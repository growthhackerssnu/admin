import { createContext, useContext } from "react";
import type { BudgetNode, FinanceOverview, TaxClass } from "./types";

export function money(value: number) {
  return value.toLocaleString("ko-KR") + "원";
}

// 수입은 +, 지출은 −를 붙인다. 거래 내역처럼 방향이 중요한 곳에서만 쓴다.
export function signed(value: number) {
  if (value === 0) return "0원";
  return (
    (value > 0 ? "+" : "−") + Math.abs(value).toLocaleString("ko-KR") + "원"
  );
}

export function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  ];
  return `${month}월 ${day}일 (${weekday})`;
}

export function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
}

export function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// 반기 안이면 오늘, 지난 반기를 보고 있으면 그 반기의 마지막 날을 기본 날짜로 쓴다.
export function defaultDate(period: { start: string; end: string }) {
  const value = today();
  if (value < period.start) return period.start;
  if (value > period.end) return period.end;
  return value;
}

export function taxClassFor(kind: "income" | "expense" | "tax"): TaxClass {
  return kind === "income"
    ? "taxable_gain"
    : kind === "tax"
      ? "tax"
      : "tax_deductible_expense";
}

// 거래·청구서에서 고를 수 있는 항목: 지출은 예산의 가장 아래 항목, 수입은 수입 계획 줄.
export function expenseCategories(data: FinanceOverview) {
  const parents = new Set(
    data.budgetTree.map((node) => node.parentId).filter(Boolean),
  );
  return data.budgetTree.filter(
    (node) => node.kind === "expense" && !parents.has(node.id),
  );
}

export function incomeCategories(data: FinanceOverview) {
  const names = new Set<string>(data.incomeLines.map((line) => line.name));
  data.ledger
    .filter((entry) => entry.type === "income")
    .forEach((entry) => names.add(entry.bucket));
  return [...names];
}

// 항목이 속한 대분류 이름. 목록에서 "어디에 쓴 돈인지"를 한눈에 보여주는 데 쓴다.
export function majorOf(data: FinanceOverview, name: string) {
  const byId = new Map(data.budgetTree.map((node) => [node.id, node]));
  let node: BudgetNode | undefined = data.budgetTree.find(
    (item) => item.name === name,
  );
  while (node?.parentId) node = byId.get(node.parentId);
  return node && node.name !== name ? node.name : undefined;
}

type NutContextValue = {
  data: FinanceOverview;
  // 저장 요청을 보내고, 성공하면 화면 데이터를 바꾸고 안내를 띄운다. 실패하면 false.
  run: (
    action: () => Promise<FinanceOverview>,
    success: string,
  ) => Promise<boolean>;
  isPastPeriod: boolean;
};

export const NutContext = createContext<NutContextValue | null>(null);

export function useNut() {
  const value = useContext(NutContext);
  if (!value) throw new Error("useNut must be used inside NutContext");
  return value;
}

export function Meter({
  used,
  total,
  label,
}: {
  used: number;
  total: number;
  label: string;
}) {
  const ratio = total > 0 ? used / total : used > 0 ? 1.01 : 0;
  const state = ratio > 1 ? "over" : ratio >= 0.85 ? "near" : "ok";
  return (
    <div
      className={"nut-meter nut-meter--" + state}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={used}
    >
      <span style={{ transform: `scaleX(${Math.min(ratio, 1)})` }} />
    </div>
  );
}
