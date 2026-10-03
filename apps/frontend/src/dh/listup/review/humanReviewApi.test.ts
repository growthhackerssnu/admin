import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../../../lib/supabase", () => ({
  supabase: { auth: { getSession } },
}));
import { HumanReviewApi, HumanReviewApiError } from "./humanReviewApi";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "https://admin-api.example.test/api/v1/");
  getSession.mockResolvedValue({
    data: { session: { access_token: "test-only-token" } },
    error: null,
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the existing login session, normalized base, explicit bearer and write key", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { ok: true } })),
  );
  await new HumanReviewApi().request(
    "/projects",
    "POST",
    { title: "제목" },
    "write-key",
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "https://admin-api.example.test/api/v1/projects",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer test-only-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "write-key",
      },
      credentials: "omit",
      redirect: "error",
      body: JSON.stringify({ title: "제목" }),
    },
  );
});
it("does not send an API request without login or an idempotency key", async () => {
  const api = new HumanReviewApi();
  await expect(api.request("/projects", "POST", {})).rejects.toThrow(
    "요청 식별자",
  );
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(api.request("/contact-history")).rejects.toThrow("로그인");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("retains the server conflict status/code for a fresh read without hiding the error", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: "VERSION_CONFLICT",
          message: "다른 담당자가 변경했습니다.",
        },
      }),
      { status: 409 },
    ),
  );
  await expect(
    new HumanReviewApi().request("/review-outreaches/work"),
  ).rejects.toMatchObject({
    status: 409,
    code: "VERSION_CONFLICT",
    message: "다른 담당자가 변경했습니다.",
  });
});
it("distinguishes a lost network response from an HTTP business error", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network failed"));
  const error = await new HumanReviewApi()
    .request("/contact-history")
    .catch((e) => e);
  expect(error).toBeInstanceOf(HumanReviewApiError);
  expect(error.status).toBe(0);
});
