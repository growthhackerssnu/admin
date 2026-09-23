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

// --- 내 정보 (admin 여부 판단용 — capabilities에 manage_settings가 있으면 admin) ---

export function getMe(token: string) {
  return request<{ userId: string; displayName: string; organizationId: string | null; capabilities: string[] }>(
    "/api/v1/me",
    { token },
  );
}

// --- 관리자: 회원 관리 ---

export interface AdminMember {
  id: string;
  displayName: string;
  cohort: string | null;
  email: string;
  role: "admin" | "acting" | "alumni";
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export function listAdminMembers(token: string) {
  return request<{ items: AdminMember[]; nextCursor: string | null }>(
    "/api/v1/admin/members?limit=200",
    { token },
  );
}

export function changeMemberRole(token: string, memberIds: string[], role: "acting" | "alumni") {
  return request<{ items: { id: string; role: string }[] }>("/api/v1/admin/members/role", {
    method: "PATCH",
    token,
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({ memberIds, role }),
  });
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
