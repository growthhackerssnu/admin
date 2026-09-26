import type { FinanceOverview } from "./types";
import { supabase } from "./lib/supabase";

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3003"
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

export function fetchOverview() {
  return request<FinanceOverview>("/api/v1/finance/overview");
}

function mutate(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
) {
  return request<FinanceOverview>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createBudgetNode(body: {
  name: string;
  parentId: string | null;
  level: string;
  kind: string;
  taxClass: string;
  budget: number;
  formula?: string | null;
  formulaExpression?: string | null;
  note?: string | null;
}) {
  return mutate("/api/v1/finance/budget-nodes", "POST", body);
}

export function updateBudgetNode(body: {
  id: string;
  name?: string;
  budget?: number;
  formula?: string | null;
  formulaExpression?: string | null;
  note?: string | null;
  order?: number;
}) {
  return mutate("/api/v1/finance/budget-nodes", "PATCH", {
    ...body,
    sortOrder: body.order,
  });
}

export function updateParameter(id: string, value: number) {
  return mutate("/api/v1/finance/parameters", "PATCH", { id, value });
}

export function createParameter(body: {
  id: string;
  label: string;
  value: number;
  unit: string;
  description: string;
}) {
  return mutate("/api/v1/finance/parameters", "POST", body);
}

export function deleteParameter(id: string) {
  return mutate("/api/v1/finance/parameters", "DELETE", { id });
}

export function reorderBudgetNodes(ids: string[]) {
  return mutate("/api/v1/finance/budget-nodes", "PATCH", { ids });
}

export function createLedgerEntry(body: {
  date: string;
  type: "income" | "expense";
  bucket: string;
  detail: string;
  amount: number;
  claimant?: string;
  note?: string;
  source?: string;
  taxClass: string;
}) {
  return mutate("/api/v1/finance/ledger", "POST", body);
}

export function updateLedgerEntry(body: {
  id: string;
  claimant?: string | null;
  note?: string | null;
  detail?: string;
}) {
  return mutate("/api/v1/finance/ledger", "PATCH", body);
}
