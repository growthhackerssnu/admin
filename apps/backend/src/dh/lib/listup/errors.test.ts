import { describe, expect, it } from "vitest";
import { ApiError } from "../errors";
import * as outreach from "../errors";
import * as listup from "./errors";

// v0.4 §6.1·§8.3: 두 봉투는 의도적으로 다르다. 한쪽을 고치다 다른 쪽을 따라가게
// 만드는 실수를 여기서 잡는다.

describe("리스트업 봉투", () => {
  it("단건은 data만 — 성공에 requestId가 없다", () => {
    expect(listup.successBody({ id: "c1" })).toEqual({ data: { id: "c1" } });
  });

  it("목록은 배열이 data에 바로 오고 page가 옆에 온다", () => {
    expect(listup.listBody([{ id: "c1" }], { nextCursor: "abc", hasMore: true })).toEqual({
      data: [{ id: "c1" }],
      page: { nextCursor: "abc", hasMore: true },
    });
  });

  it("오류는 details를 싣고 requestId가 error 안에 들어간다", () => {
    const body = listup.errorBody(
      new ApiError("FIT_REQUIRED", "적합 필요", { details: { effectiveFit: "pending" } }),
      "req-1",
    );
    expect(body).toEqual({
      error: {
        code: "FIT_REQUIRED",
        message: "적합 필요",
        details: { effectiveFit: "pending" },
        requestId: "req-1",
      },
    });
    expect(body.error).not.toHaveProperty("retryable");
    expect(body).not.toHaveProperty("requestId");
  });

  it("fieldErrors로 던져도 details 자리에 실린다", () => {
    const body = listup.errorBody(
      new ApiError("VALIDATION_ERROR", "확인", { fieldErrors: { limit: "1 이상" } }),
      "req-2",
    );
    expect(body.error.details).toEqual({ limit: "1 이상" });
  });
});

describe("두 봉투는 같은 입력에 다르게 반응한다", () => {
  it("목록의 배열 위치가 다르다", () => {
    const listupBody = listup.listBody([{ id: "a" }], { nextCursor: null, hasMore: false });
    const outreachBody = outreach.listBody([{ id: "a" }], null);
    expect(Array.isArray(listupBody.data)).toBe(true);
    expect(Array.isArray(outreachBody.data)).toBe(false);
    expect(outreachBody.data.items).toEqual([{ id: "a" }]);
  });

  it("오류 봉투의 requestId 위치와 부가 정보 키가 다르다", () => {
    const error = new ApiError("NOT_FOUND", "없음", { fieldErrors: { id: "없음" } });
    const listupBody = listup.errorBody(error, "r");
    const outreachBody = outreach.errorBody(error, "r");

    expect(listupBody.error).toHaveProperty("requestId");
    expect(listupBody.error).toHaveProperty("details");
    expect(outreachBody).toHaveProperty("requestId");
    expect(outreachBody.error).toHaveProperty("fieldErrors");
    expect(outreachBody.error).toHaveProperty("retryable");
  });
});

describe("충돌 코드는 계열마다 다르다 (v0.4 §6.13)", () => {
  it("둘 다 409지만 이름이 다르다", () => {
    // 조사 계열은 REVISION_CONFLICT, 발송 계열은 VERSION_CONFLICT.
    expect(new ApiError("REVISION_CONFLICT", "x").status).toBe(409);
    expect(new ApiError("VERSION_CONFLICT", "x").status).toBe(409);
  });
});
