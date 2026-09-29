const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiClientError extends Error {
  code: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  constructor(
    code: string,
    message: string,
    opts?: { fieldErrors?: Record<string, string>; retryable?: boolean },
  ) {
    super(message);
    this.code = code;
    this.fieldErrors = opts?.fieldErrors;
    this.retryable = opts?.retryable ?? false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new ApiClientError(
      err?.code ?? "UNKNOWN",
      err?.message ?? "알 수 없는 오류가 발생했습니다.",
      { fieldErrors: err?.fieldErrors, retryable: err?.retryable },
    );
  }
  return json.data as T;
}

// --- 내 정보 (디렉토리의 "내 프로필" 카드, dh·hr·admin 전환 side pane 노출 여부 판단용) ---

export interface Me {
  role: "admin" | "acting" | "alumni";
  notionPageId: string | null;
}

export function getMe(token: string) {
  return request<Me>("/api/v1/people/me", { token });
}

// --- 디렉토리 목록 (ARCHITECTURE.md §12.2) ---

export interface PersonSummary {
  notionPageId: string;
  name: string;
  cohort: number;
  department: string[];
  jobField: string | null;
  team: string[];
  position: string | null;
  currentCareerOneLine: string | null;
  linkedin: string | null;
  profileImageUrl: string | null;
}

export async function getPeople(token: string): Promise<PersonSummary[]> {
  const { people } = await request<{ people: PersonSummary[] }>("/api/v1/people", { token });
  return people;
}

// --- 프로필 상세 (ARCHITECTURE.md §12.3) ---

export interface PersonDetail extends PersonSummary {
  email: string | null;
  careersText: string;
  activitiesText: string;
  projectsText: string;
}

export function getPerson(notionPageId: string, token: string) {
  return request<PersonDetail>(`/api/v1/people/${notionPageId}`, { token });
}

// --- 수정 제출 (ARCHITECTURE.md §12.3, §12.3.1) ---

export interface EditRequestFormValues {
  email: string | null;
  linkedin: string | null;
  currentCareerOneLine: string | null;
  cohort: number;
  jobField: string | null;
  department: string[];
  team: string[];
  careersText: string;
  activitiesText: string;
  projectsText: string;
}

export type EditRequestStatus = "pending" | "approved" | "rejected";

export interface EditRequestDiffEntry {
  before: unknown;
  after: unknown;
}

export interface EditRequest {
  id: string;
  notionPageId: string;
  requesterMemberId: string;
  diff: {
    structuredFields: Record<string, EditRequestDiffEntry>;
    freeTextSections: Record<string, EditRequestDiffEntry>;
  };
  status: EditRequestStatus;
  submittedAt: string;
  reviewedByMemberId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export function submitEditRequest(values: EditRequestFormValues, token: string) {
  return request<EditRequest>("/api/v1/edit-requests", {
    method: "POST",
    body: JSON.stringify(values),
    token,
  });
}

export async function getMyEditRequests(token: string): Promise<EditRequest[]> {
  const { requests } = await request<{ requests: EditRequest[] }>("/api/v1/edit-requests/mine", { token });
  return requests;
}

// --- 승인 큐 (ARCHITECTURE.md §12.4, admin 전용) ---

export interface AdminEditRequest extends EditRequest {
  requesterName: string;
  requesterCohort: string | null;
}

export async function getAdminEditRequests(token: string): Promise<AdminEditRequest[]> {
  const { requests } = await request<{ requests: AdminEditRequest[] }>("/api/v1/admin/edit-requests", { token });
  return requests;
}

export function approveEditRequest(id: string, reviewNote: string | undefined, token: string) {
  return request<EditRequest>(`/api/v1/admin/edit-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ reviewNote }),
    token,
  });
}

export function rejectEditRequest(id: string, reviewNote: string, token: string) {
  return request<EditRequest>(`/api/v1/admin/edit-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reviewNote }),
    token,
  });
}

// --- 수정 폼 드롭다운 옵션 (Notion 실제 select 값 그대로) ---

export interface FieldOptions {
  jobField: string[];
  department: string[];
  team: string[];
  cohort: number[];
}

export function getFieldOptions(token: string) {
  return request<FieldOptions>("/api/v1/field-options", { token });
}
