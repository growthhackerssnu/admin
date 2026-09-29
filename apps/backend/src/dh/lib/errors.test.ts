import { describe, expect, it } from "vitest";
import { ApiError, errorBody, fieldErrorsOf, listBody, successBody } from "./errors";

describe("응답 봉투", () => {
  // requestId는 withApiHandler가 응답 직전에 합치므로 이 함수들은 data만 만든다.
  it("단건은 data를 감싼다", () => {
    expect(successBody({ id: "c1" })).toEqual({ data: { id: "c1" } });
  });

  it("목록은 items와 nextCursor를 data 안에 감싼다", () => {
    expect(listBody([{ id: "c1" }], "abc")).toEqual({
      data: { items: [{ id: "c1" }], nextCursor: "abc" },
    });
  });

  it("오류는 fieldErrors와 retryable을 싣는다", () => {
    const body = errorBody(
      new ApiError("VALIDATION_ERROR", "입력값 확인", { fieldErrors: { limit: "1 이상의 정수" } }),
      "req-2",
    );
    expect(body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "입력값 확인",
        fieldErrors: { limit: "1 이상의 정수" },
        retryable: false,
      },
      requestId: "req-2",
    });
  });
});

describe("에러 코드 → HTTP 상태", () => {
  it("필드·쿼리·출처 문제는 전부 422다 — v0.3에는 400대 코드가 없다", () => {
    expect(new ApiError("VALIDATION_ERROR", "x").status).toBe(422);
    expect(new ApiError("UNSUPPORTED_SOURCE", "x").status).toBe(422);
  });

  it("상태·충돌 계열은 409다", () => {
    for (const code of [
      "VERSION_CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "INVALID_STATE",
      "ALREADY_EXISTS",
      "FIT_REQUIRED",
      "NO_CONTACT_TO_VERIFY",
      "TASK_ALREADY_RUNNING",
      "TASK_NOT_RETRYABLE",
    ] as const) {
      expect(new ApiError(code, "x").status).toBe(409);
    }
  });
});

describe("retryable", () => {
  it("한도·일시 장애만 기본 true다", () => {
    expect(new ApiError("RATE_LIMITED", "x").retryable).toBe(true);
    expect(new ApiError("SERVICE_UNAVAILABLE", "x").retryable).toBe(true);
    expect(new ApiError("VALIDATION_ERROR", "x").retryable).toBe(false);
    expect(new ApiError("VERSION_CONFLICT", "x").retryable).toBe(false);
  });
});

describe("fieldErrorsOf", () => {
  it("zod의 메시지 배열을 필드당 한 줄로 눌러 담는다", () => {
    expect(fieldErrorsOf({ verdict: ["필수입니다", "무시됨"], reason: undefined })).toEqual({
      verdict: "필수입니다",
      reason: "",
    });
  });
});
