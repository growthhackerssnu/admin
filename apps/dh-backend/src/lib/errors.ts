// 에러 코드·응답 봉투. 리스트업–컨택 통합 명세 v0.3 §7.1, §12가 기준이다.
// 응답 키는 camelCase이고 DB 컬럼만 snake_case다(변환은 Prisma + serializer가 한다).

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  // 낙관적 잠금 충돌은 계열마다 코드가 다르다(v0.4 §6.13). 조사 기록은 revision을,
  // 컨택 건·기업은 version을 쓰기 때문에 클라이언트가 어느 쪽을 다시 읽어야 하는지
  // 코드만 보고 알 수 있다.
  REVISION_CONFLICT: "REVISION_CONFLICT",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  INVALID_STATE: "INVALID_STATE",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  FIT_REQUIRED: "FIT_REQUIRED",
  NO_CONTACT_TO_VERIFY: "NO_CONTACT_TO_VERIFY",
  TASK_ALREADY_RUNNING: "TASK_ALREADY_RUNNING",
  TASK_NOT_RETRYABLE: "TASK_NOT_RETRYABLE",
  // 발송 업무 코드
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

// v0.3에는 400대 코드가 없다. 잘못된 필드·쿼리·커서는 전부 422 VALIDATION_ERROR다(§7.1).
const STATUS_BY_CODE: Record<ErrorCodeName, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATE: 409,
  ALREADY_EXISTS: 409,
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

// 오류 "값"은 한 벌이고 "봉투"만 두 벌이다(v0.4 §6.1). fieldErrors는 기존 발송 봉투가,
// details는 리스트업 봉투가 싣는다. 던지는 쪽은 둘 중 편한 것을 쓰고, 렌더링하는 쪽이
// 자기 형식으로 옮긴다.
export class ApiError extends Error {
  code: ErrorCodeName;
  status: number;
  fieldErrors?: Record<string, string>;
  details?: Record<string, unknown>;
  retryable: boolean;

  constructor(
    code: ErrorCodeName,
    message: string,
    opts?: {
      fieldErrors?: Record<string, string>;
      details?: Record<string, unknown>;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fieldErrors = opts?.fieldErrors;
    this.details = opts?.details;
    this.retryable = opts?.retryable ?? DEFAULT_RETRYABLE.has(code);
  }
}

// 클라이언트가 그대로 다시 보내도 되는 오류만 true다. 나머지는 사람이 뭔가 바꿔야 한다.
const DEFAULT_RETRYABLE = new Set<ErrorCodeName>(["RATE_LIMITED", "SERVICE_UNAVAILABLE"]);

// ---------- 기존 발송(컨택) 봉투 ----------
//
// v0.4 §6.1이 기존 대협봇 경로의 응답 구조를 그대로 두라고 했다. 리스트업 신규 경로는
// 다른 봉투를 쓴다 — src/lib/listup/errors.ts. 표기법 예외가 아니라 호환 경계이고,
// §8.3이 "표기법 변경에 편승해 통합하지 않는다"고 명시했다.
//
// requestId는 withApiHandler가 응답 직전에 합친다. 핸들러마다 들고 다니면 빠뜨리기
// 쉽고, 어차피 전송 계층의 관심사라 한 곳에서 붙이는 편이 안전하다.
export function successBody<T>(data: T) {
  return { data };
}

export function listBody<T>(items: T[], nextCursor: string | null) {
  return { data: { items, nextCursor } };
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

// zod의 flatten().fieldErrors는 필드마다 메시지 배열을 준다. 봉투는 필드당 한 줄만
// 싣기 때문에 첫 메시지로 눌러 담는다.
export function fieldErrorsOf(flattened: Record<string, string[] | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(flattened).map(([field, messages]) => [field, messages?.[0] ?? ""]),
  );
}
