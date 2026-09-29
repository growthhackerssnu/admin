// 에러 코드·응답 봉투. docs/admin/api-contract.md §3, §11과 같은 형태(이
// 앱이 실제로 쓰는 코드만 선언한다).

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<ErrorCodeName, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
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
