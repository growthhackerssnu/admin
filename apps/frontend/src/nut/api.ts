import type {
  AttendanceData,
  AttendanceType,
  Billing,
  Excuse,
  FinanceOverview,
  TaxClass,
  TaxOverview,
} from "./types";
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
  teamId?: string | null;
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
  setCard: (id: string, prepaid: boolean) =>
    send("claims", "PATCH", { id, type: "card", prepaid }),
  pay: (id: string, date: string, bucket?: string, teamId?: string | null) =>
    send("claims", "PATCH", { id, type: "pay", date, bucket, teamId }),
};

export type TeamInput = {
  id?: string;
  scope: "project" | "team";
  term?: "summer" | "regular" | "";
  name: string;
  supportBudget: number;
  technicalBudget: number;
  note?: string | null;
};

export const accountingApi = {
  saveTeam: (periodId: string, input: TeamInput) =>
    send("accounting", input.id ? "PATCH" : "POST", { periodId, ...input }),
  removeTeam: (id: string) => send("accounting", "DELETE", { id }),
};

export const incomeApi = {
  save: (
    periodId: string,
    input: { id?: string; name: string; budget: number; note?: string | null },
  ) =>
    send("income-lines", input.id ? "PATCH" : "POST", { periodId, ...input }),
  remove: (id: string) => send("income-lines", "DELETE", { id }),
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
  billing?: Billing;
};

export const budgetApi = {
  createNode: (periodId: string, input: BudgetNodeInput) =>
    send("budget-nodes", "POST", { periodId, ...input }),
  updateNode: (
    id: string,
    input: Partial<
      Pick<
        BudgetNodeInput,
        "name" | "budget" | "formulaExpression" | "note" | "billing"
      >
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
      category?: string;
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

export type RefundAccountInput = {
  id?: string;
  name: string;
  cohort?: string | null;
  email?: string | null;
  bankAccount: string;
};

export const refundApi = {
  save: (periodId: string, input: RefundAccountInput) =>
    send("refund-accounts", input.id ? "PATCH" : "POST", {
      periodId,
      ...input,
    }),
  remove: (periodId: string, id: string) =>
    send("refund-accounts", "DELETE", { periodId, id }),
};

export function fetchTax(fy?: number) {
  return request<TaxOverview>(`/api/v1/finance/tax${fy ? `?fy=${fy}` : ""}`);
}

export function saveTaxInput(fy: number, key: string, value: number) {
  return request<TaxOverview>("/api/v1/finance/tax", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fy, key, value }),
  });
}

export type AttendanceInput = {
  id?: string;
  date: string;
  name: string;
  email?: string | null;
  project?: string | null;
  type: AttendanceType;
  excuse: Excuse;
  minutesLate: number | null;
  tier?: string | null;
  note?: string | null;
};

// 출석체크는 재무 화면과 따로 불러온다. 쓰기는 그 반기의 출석 데이터를 돌려준다.
export const attendanceApi = {
  fetch: (periodId: string) =>
    request<AttendanceData>(
      `/api/v1/attendance?period=${encodeURIComponent(periodId)}`,
    ),
  save: (periodId: string, input: AttendanceInput) =>
    request<AttendanceData>("/api/v1/attendance", {
      method: input.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, ...input }),
    }),
  // 그 날짜까지의 기록을 벌점·벌금 합계에서 뺀다(분기마다). undoClear는 가장 최근 초기화를 되돌린다.
  clear: (periodId: string, through: string) =>
    request<AttendanceData>("/api/v1/attendance/resets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, through }),
    }),
  undoClear: (periodId: string) =>
    request<AttendanceData>("/api/v1/attendance/resets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId }),
    }),
  // key: '<규칙 id>.points'·'<규칙 id>.fine'·'session-minutes'
  saveRule: (periodId: string, key: string, value: number) =>
    request<AttendanceData>("/api/v1/attendance/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, key, value }),
    }),
  remove: (periodId: string, id: string) =>
    request<AttendanceData>("/api/v1/attendance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, id }),
    }),
};
