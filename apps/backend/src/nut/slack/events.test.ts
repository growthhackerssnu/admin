import { beforeEach, describe, expect, it, vi } from "vitest";

const createClaim = vi.fn(async () => "claim-slack-Fx1");
vi.mock("@/lib/prisma", () => ({ prisma: { member: { findUnique: vi.fn(async () => null) } } }));
vi.mock("@/nut/lib/financeRepository", () => ({ createClaim, resolvePeriodId: vi.fn(async () => "2026-2h") }));

// Slack Web API 흉내: 토큰 "good"만 GH NUT 앱(A0C802VMHK2)이 발급받은 것으로 답한다.
const calls: string[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split("/").pop()!;
    calls.push(method);
    const good = String((init.headers as Record<string, string>).Authorization) === "Bearer good";
    const body =
      method === "auth.test"
        ? good
          ? { ok: true, bot_id: "B1" }
          : { ok: false, error: "invalid_auth" }
        : method === "bots.info"
          ? { ok: true, bot: { app_id: "A0C802VMHK2" } }
          : method === "users.info"
            ? { ok: true, user: { real_name: "홍길동", profile: {} } }
            : { ok: true };
    return new Response(JSON.stringify(body));
  }),
);

const { POST } = await import("../../../app/api/slack/events/route");
const post = (payload: unknown) =>
  POST(new Request("http://localhost/api/slack/events", { method: "POST", body: JSON.stringify(payload) }));
const step = (token: string) => ({
  type: "event_callback",
  event: {
    type: "function_executed",
    function: { callback_id: "register_nut_claim" },
    function_execution_id: "Fx1",
    bot_access_token: token,
    inputs: { claimant: "U1", date: "2026-10-06", detail: "루키 다과", amount: "23,500원", prepaid: "예" },
  },
});

describe("POST /api/slack/events", () => {
  beforeEach(() => {
    calls.length = 0;
    createClaim.mockClear();
  });

  it("echoes Slack's URL verification challenge", async () => {
    const res = await post({ type: "url_verification", challenge: "abc" });
    expect(await res.json()).toEqual({ challenge: "abc" });
  });

  it("creates one claim keyed by the execution id when the token belongs to GH NUT", async () => {
    const res = await post(step("good"));
    expect(res.status).toBe(200);
    expect(createClaim).toHaveBeenCalledWith(
      "2026-2h",
      expect.objectContaining({ id: "claim-slack-Fx1", amount: 23500, prepaid: true, claimant: "홍길동", source: "Slack" }),
    );
    expect(calls).toContain("functions.completeSuccess");
  });

  it("rejects a forged event whose token Slack does not recognize", async () => {
    const res = await post(step("forged"));
    expect(res.status).toBe(401);
    expect(createClaim).not.toHaveBeenCalled();
  });
});
