import type { FinanceOverview, TaxClass } from "./types";
import { supabase } from "../lib/supabase";

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export class NutApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NutApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new NutApiError(
      payload?.error?.message ?? "NUT 데이터를 불러오지 못했습니다.",
    );
  return payload.data as T;
}

export type NutMember = {
  id: string;
  displayName: string;
  role: "admin" | "acting" | "alumni";
};

// 로그인한 회원 정보. NUT 권한(admin·acting)이 없으면 403으로 실패한다.
export function fetchMe() {
  return request<{ member: NutMember }>("/api/v1/ping").then((d) => d.member);
}

export function fetchOverview(periodId?: string) {
  const query = periodId ? `?period=${encodeURIComponent(periodId)}` : "";
  return request<FinanceOverview>(`/api/v1/finance/overview${query}`);
}

// 모든 쓰기 API는 바뀐 반기의 전체 화면 데이터를 돌려준다.
function send(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
) {
  return request<FinanceOverview>(`/api/v1/finance/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type LedgerInput = {
  date: string;
  type: "income" | "expense";
  bucket: string;
  detail: string;
  amount: number;
  claimant?: string | null;
  note?: string | null;
  taxClass: TaxClass;
};

export const ledgerApi = {
  create: (periodId: string, input: LedgerInput) =>
    send("ledger", "POST", { periodId, ...input }),
  update: (id: string, input: Partial<LedgerInput>) =>
    send("ledger", "PATCH", { id, ...input }),
  remove: (id: string) => send("ledger", "DELETE", { id }),
};

export const claimApi = {
  approve: (id: string, bucket?: string) =>
    send("claims", "PATCH", { id, type: "approve", bucket }),
  reject: (id: string, reason: string) =>
    send("claims", "PATCH", { id, type: "reject", reason }),
  reopen: (id: string) => send("claims", "PATCH", { id, type: "reopen" }),
  pay: (id: string, date: string, bucket?: string) =>
    send("claims", "PATCH", { id, type: "pay", date, bucket }),
};

export type TeamInput = {
  id?: string;
  scope: "project" | "team";
  name: string;
  supportBudget: number;
  technicalBudget: number;
  note?: string | null;
};

export type TeamEntryInput = {
  scope: "project" | "team";
  owner: string;
  category: "support" | "technical";
  date: string;
  detail: string;
  amount: number;
  claimant?: string | null;
};

export const accountingApi = {
  saveTeam: (periodId: string, input: TeamInput) =>
    send("accounting", input.id ? "PATCH" : "POST", {
      kind: "team",
      periodId,
      ...input,
    }),
  removeTeam: (id: string) =>
    send("accounting", "DELETE", { kind: "team", id }),
  addEntry: (periodId: string, input: TeamEntryInput) =>
    send("accounting", "POST", { kind: "entry", periodId, ...input }),
  updateEntry: (id: string, input: Partial<TeamEntryInput>) =>
    send("accounting", "PATCH", { kind: "entry", id, ...input }),
  removeEntry: (id: string) =>
    send("accounting", "DELETE", { kind: "entry", id }),
};

export type BudgetNodeInput = {
  name: string;
  parentId: string | null;
  level: "major" | "middle" | "minor";
  kind: "income" | "expense" | "tax";
  taxClass: TaxClass;
  budget: number;
  formulaExpression?: string | null;
  note?: string | null;
};

export const budgetApi = {
  createNode: (periodId: string, input: BudgetNodeInput) =>
    send("budget-nodes", "POST", { periodId, ...input }),
  updateNode: (
    id: string,
    input: Partial<
      Pick<BudgetNodeInput, "name" | "budget" | "formulaExpression" | "note">
    >,
  ) => send("budget-nodes", "PATCH", { id, ...input }),
  removeNode: (id: string) => send("budget-nodes", "DELETE", { id }),
  reorder: (ids: string[]) => send("budget-nodes", "PATCH", { ids }),
  updateParameter: (periodId: string, id: string, value: number) =>
    send("parameters", "PATCH", { periodId, id, value }),
  createParameter: (
    periodId: string,
    input: {
      id: string;
      label: string;
      value: number;
      unit: string;
      description: string;
    },
  ) => send("parameters", "POST", { periodId, ...input }),
  removeParameter: (periodId: string, id: string) =>
    send("parameters", "DELETE", { periodId, id }),
};

export function createPeriod(input: {
  id: string;
  label: string;
  start: string;
  end: string;
  copyFromId: string;
}) {
  return send("periods", "POST", input);
}
