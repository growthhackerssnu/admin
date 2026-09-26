export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_ERROR";

const statuses: Record<ErrorCode, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, NOT_FOUND: 404, INTERNAL_ERROR: 500 };

export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.status = statuses[code];
  }
}

export function successBody<T>(data: T, requestId: string) { return { data, requestId }; }
export function errorBody(error: ApiError, requestId: string) { return { error: { code: error.code, message: error.message }, requestId }; }
