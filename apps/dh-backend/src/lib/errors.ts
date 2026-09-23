// 에러 코드·응답 봉투. docs/admin/api-contract.md §3, §11 그대로.

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  ACTIVE_CYCLE_CHANGED: "ACTIVE_CYCLE_CHANGED",
  INVALID_STATE: "INVALID_STATE",
  SAME_CYCLE_BLOCKED: "SAME_CYCLE_BLOCKED",
  CONTACT_EXCLUDED: "CONTACT_EXCLUDED",
  TEMPLATE_NOT_CONNECTED: "TEMPLATE_NOT_CONNECTED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  // api-contract.md는 "5xx/네트워크 오류"를 클라이언트 처리 지침으로만 언급한다.
  // 예기치 못한 서버 오류를 위한 폴백 코드로 추가.
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<ErrorCodeName, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  VERSION_CONFLICT: 409,
  ACTIVE_CYCLE_CHANGED: 409,
  INVALID_STATE: 409,
  SAME_CYCLE_BLOCKED: 409,
  CONTACT_EXCLUDED: 409,
  TEMPLATE_NOT_CONNECTED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ErrorCodeName;
  status: number;
  fieldErrors?: Record<string, string>;
  retryable: boolean;

  constructor(
    code: ErrorCodeName,
    message: string,
    opts?: { fieldErrors?: Record<string, string>; retryable?: boolean },
  ) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fieldErrors = opts?.fieldErrors;
    this.retryable = opts?.retryable ?? false;
  }
}

export function successBody<T>(data: T, requestId: string) {
  return { data, requestId };
}

export function listBody<T>(items: T[], nextCursor: string | null, requestId: string) {
  return { data: { items, nextCursor }, requestId };
}

export function errorBody(error: ApiError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable,
    },
    requestId,
  };
}
