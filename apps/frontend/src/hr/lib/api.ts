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
  /** 승인 큐를 볼 수 있는지(admin과 PR 팀장·팀원). */
  canReview: boolean;
  notionPageId: string | null;
}

export async function getMe(token: string, userId?: string): Promise<Me> {
  const me = await request<Me>("/api/v1/people/me", { token });
  return userId ? remember(userId, "me", me) : me;
}

// --- 디렉토리 목록 (ARCHITECTURE.md §12.2) ---

export interface PersonSummary {
  notionPageId: string;
  name: string;
  cohort: number;
  department: string[];
  // 2026-09-30: Notion "직무 계열"이 다중 선택으로 바뀌어 배열이다.
  jobField: string[];
  team: string[];
  position: string | null;
  currentCareerOneLine: string | null;
  linkedin: string | null;
  profileImageUrl: string | null;
}

// 서버가 옛 형태(직무 계열이 문자열/null)의 캐시를 잠깐 줄 수 있어 배열로 맞춘다.
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" && value ? [value] : [];
}

// 마지막으로 받은 응답을 메모리에 들고 있다가, 화면에 다시 들어오면 즉시 보여주고
// 그 사이 서버에서 새로 받아 덮어쓴다(stale-while-revalidate). 디렉토리 ↔ 프로필
// 상세를 오갈 때마다 API 왕복을 기다리지 않게 하려는 목적이다. 사용자별로 키를
// 나눠서(로그아웃 후 다른 계정으로 로그인해도) 다른 사람 데이터가 안 섞인다.
const lastResponses = new Map<string, unknown>();

export function peekCached<T>(userId: string, name: string): T | undefined {
  return lastResponses.get(`${userId}:${name}`) as T | undefined;
}

function remember<T>(userId: string, name: string, value: T): T {
  lastResponses.set(`${userId}:${name}`, value);
  return value;
}

export async function getPeople(token: string, userId?: string): Promise<PersonSummary[]> {
  const { people } = await request<{ people: PersonSummary[] }>("/api/v1/people", { token });
  const normalized = people.map((p) => ({ ...p, jobField: toStringArray(p.jobField) }));
  return userId ? remember(userId, "people", normalized) : normalized;
}

// --- 프로필 상세 (ARCHITECTURE.md §12.3) ---

export interface PersonDetail extends PersonSummary {
  email: string | null;
  careersText: string;
  activitiesText: string;
  projectsText: string;
}

export async function getPerson(notionPageId: string, token: string): Promise<PersonDetail> {
  const person = await request<PersonDetail>(`/api/v1/people/${notionPageId}`, { token });
  return { ...person, jobField: toStringArray(person.jobField) };
}

// --- 수정 제출 (ARCHITECTURE.md §12.3, §12.3.1) ---

export interface EditRequestFormValues {
  email: string | null;
  linkedin: string | null;
  currentCareerOneLine: string | null;
  cohort: number;
  jobField: string[];
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
  // 대기 중 요청 중 Notion에 아직 없는 새 옵션(오타·중복 검토용). 키는 속성명("직무 계열"/"학과").
  newOptions?: Record<string, string[]>;
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
