// 에러 코드·응답 봉투. 리스트업_데이터스키마_API명세_v0.1.md §2.2, §7이 유일한 기준이다.
// 기존 규약(camelCase, { data, requestId }, VERSION_CONFLICT)은 폐기했다.

export const ErrorCode = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  REVISION_CONFLICT: "REVISION_CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  INVALID_STATE: "INVALID_STATE",
  FIT_REQUIRED: "FIT_REQUIRED",
  NO_CONTACT_TO_VERIFY: "NO_CONTACT_TO_VERIFY",
  TASK_ALREADY_RUNNING: "TASK_ALREADY_RUNNING",
  TASK_NOT_RETRYABLE: "TASK_NOT_RETRYABLE",
  // 발송 업무 코드. SAME_CYCLE_BLOCKED에서 이름만 바뀌었다.
  SAME_QUARTER_BLOCKED: "SAME_QUARTER_BLOCKED",
  CONTACT_EXCLUDED: "CONTACT_EXCLUDED",
  TEMPLATE_NOT_CONNECTED: "TEMPLATE_NOT_CONNECTED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNSUPPORTED_SOURCE: "UNSUPPORTED_SOURCE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode];

// 400과 422의 경계: JSON 파싱 실패·필수 헤더 누락·쿼리 형식 오류는 INVALID_REQUEST(400),
// 스키마는 맞는데 값 제약을 어긴 경우는 VALIDATION_ERROR(422).
const STATUS_BY_CODE: Record<ErrorCodeName, number> = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATE: 409,
  FIT_REQUIRED: 409,
  NO_CONTACT_TO_VERIFY: 409,
  TASK_ALREADY_RUNNING: 409,
  TASK_NOT_RETRYABLE: 409,
  SAME_QUARTER_BLOCKED: 409,
  CONTACT_EXCLUDED: 409,
  TEMPLATE_NOT_CONNECTED: 409,
  VALIDATION_ERROR: 422,
  UNSUPPORTED_SOURCE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class ApiError extends Error {
  code: ErrorCodeName;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: ErrorCodeName, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function successBody<T>(data: T) {
  return { data };
}

export type PageInfo = { nextCursor: string | null; hasMore: boolean };

export function listBody<T>(items: T[], page: PageInfo) {
  return {
    data: items,
    page: { next_cursor: page.nextCursor, has_more: page.hasMore },
  };
}

// request_id는 오류 봉투 안에만 실린다 (명세 §7). 성공 응답에는 없다.
export function errorBody(error: ApiError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      request_id: requestId,
    },
  };
}
