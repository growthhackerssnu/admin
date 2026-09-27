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

function idempotencyKey() {
  return crypto.randomUUID();
}

// --- 가입/OTP (로그인 전, 토큰 불필요) ---

export function createSignupRequest(input: { cohort: string; name: string; desiredEmail: string }) {
  return request<{ signupRequestId: string; sentTo: string; expiresAt: string }>(
    "/api/auth/signup-requests",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function verifySignupRequest(signupRequestId: string, otp: string) {
  return request<{ memberId: string; email: string; role: string; displayName: string }>(
    `/api/auth/signup-requests/${signupRequestId}/verify`,
    { method: "POST", body: JSON.stringify({ otp }) },
  );
}

// --- 내 정보 (로그인 직후 어디로 보낼지 판단용) ---

export interface Me {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "acting" | "alumni";
  redirectPath: string;
}

export function getMe(token: string) {
  return request<Me>("/api/v1/me", { token });
}

// --- 관리자: 회원 관리 ---

// 운영팀 직책. 백엔드 core.OpsRole enum과 같은 값이며, 한국어 이름은 화면
// 쪽(AdminMembers)이 갖고 있다 — role 라벨도 같은 방식이다.
export type OpsRole =
  | "president"
  | "vice_president"
  | "treasurer"
  | "external_lead"
  | "hr_lead"
  | "pr_lead"
  | "edu_lead"
  | "external_member"
  | "hr_member"
  | "pr_member";

export interface AdminMember {
  id: string;
  displayName: string;
  cohort: string | null;
  email: string;
  role: "admin" | "acting" | "alumni";
  /** acting에게만 값이 있다. acting인데 null이면 아직 직책을 지정하지 않은 회원. */
  opsRole: OpsRole | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

// role과 운영팀 직책은 항상 같이 바뀐다 — acting이면 직책이 필수고, alumni가
// 되면 직책은 사라진다. 그 규칙을 타입으로 그대로 옮긴다.
export type RoleChange = { role: "acting"; opsRole: OpsRole } | { role: "alumni" };

export function listAdminMembers(token: string) {
  return request<{ items: AdminMember[]; nextCursor: string | null }>(
    "/api/v1/admin/members?limit=200",
    { token },
  );
}

export function changeMemberRole(token: string, memberIds: string[], change: RoleChange) {
  return request<{ items: { id: string; role: string; opsRole: OpsRole | null }[] }>(
    "/api/v1/admin/members/role",
    {
      method: "PATCH",
      token,
      headers: { "Idempotency-Key": idempotencyKey() },
      body: JSON.stringify({ memberIds, ...change }),
    },
  );
}

export function deactivateMembers(token: string, memberIds: string[]) {
  return request<{ items: { id: string; active: boolean }[] }>("/api/v1/admin/members/deactivate", {
    method: "POST",
    token,
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ memberIds }),
  });
}

export function reactivateMembers(token: string, memberIds: string[]) {
  return request<{ items: { id: string; active: boolean }[] }>("/api/v1/admin/members/reactivate", {
    method: "POST",
    token,
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ memberIds }),
  });
}
