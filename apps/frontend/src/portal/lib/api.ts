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
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiClientError(
      "NETWORK",
      "서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
      { retryable: true },
    );
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    // 우리 API의 에러 봉투가 아니면(호스팅 오류 페이지 등) 서버 자체에 닿지 못한 것이다.
    throw new ApiClientError(
      err?.code ?? "UNREACHABLE",
      err?.message ??
        `서버에 연결하지 못했습니다(HTTP ${res.status}). 관리자에게 문의하세요.`,
      { fieldErrors: err?.fieldErrors, retryable: err?.retryable ?? true },
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

// --- 관리자: GH Bot 접근 토큰 ---

export interface GhbotTokenSummary {
  id: string;
  prefix: string;
  issuedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface GhbotTokenMember {
  memberId: string;
  displayName: string;
  cohort: string | null;
  email: string;
  token: GhbotTokenSummary | null;
}

export function listGhbotTokenMembers(token: string) {
  return request<{ items: GhbotTokenMember[] }>("/api/v1/admin/ghbot-tokens", { token });
}

// 원문은 이 응답에서만 제공된다. 호출자는 즉시 표시하고 상태에는 저장하지 않는다.
export function issueGhbotToken(token: string, memberId: string) {
  return request<{ token: string; tokenId: string; prefix: string; issuedAt: string }>(
    "/api/v1/admin/ghbot-tokens",
    { method: "POST", token, body: JSON.stringify({ memberId }) },
  );
}

export function revokeGhbotToken(token: string, tokenId: string) {
  return request<{ id: string; revokedAt: string }>(`/api/v1/admin/ghbot-tokens/${tokenId}/revoke`, {
    method: "POST",
    token,
    headers: { "Idempotency-Key": idempotencyKey() },
    body: JSON.stringify({}),
  });
}
