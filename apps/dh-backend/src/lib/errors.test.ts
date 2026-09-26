import { describe, expect, it } from "vitest";
import { ApiError, errorBody, listBody, successBody } from "./errors";

describe("응답 봉투", () => {
  it("단건은 data만 싣는다 — 성공 응답에 request_id는 없다", () => {
    expect(successBody({ id: "c1" })).toEqual({ data: { id: "c1" } });
  });

  it("목록은 data 배열과 page를 snake_case로 싣는다", () => {
    expect(listBody([{ id: "c1" }], { nextCursor: "abc", hasMore: true })).toEqual({
      data: [{ id: "c1" }],
      page: { next_cursor: "abc", has_more: true },
    });
  });

  it("오류는 error 안에 request_id를 넣고, details는 있을 때만 붙인다", () => {
    const withDetails = errorBody(
      new ApiError("REVISION_CONFLICT", "충돌", { expected_revision: 3, current_revision: 4 }),
      "req-1",
    );
    expect(withDetails).toEqual({
      error: {
        code: "REVISION_CONFLICT",
        message: "충돌",
        details: { expected_revision: 3, current_revision: 4 },
        request_id: "req-1",
      },
    });

    const withoutDetails = errorBody(new ApiError("NOT_FOUND", "없음"), "req-2");
    expect(withoutDetails.error).not.toHaveProperty("details");
  });
});

describe("에러 코드 → HTTP 상태", () => {
  it("형식 오류는 400, 값 제약 위반은 422로 나뉜다", () => {
    expect(new ApiError("INVALID_REQUEST", "x").status).toBe(400);
    expect(new ApiError("VALIDATION_ERROR", "x").status).toBe(422);
    expect(new ApiError("UNSUPPORTED_SOURCE", "x").status).toBe(422);
  });

  it("리스트업 전용 충돌 코드는 전부 409다", () => {
    for (const code of [
      "REVISION_CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "INVALID_STATE",
      "FIT_REQUIRED",
      "NO_CONTACT_TO_VERIFY",
      "TASK_ALREADY_RUNNING",
      "TASK_NOT_RETRYABLE",
    ] as const) {
      expect(new ApiError(code, "x").status).toBe(409);
    }
  });
});
