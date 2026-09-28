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
  return request<Me>("/api/v1/me", { token });
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
