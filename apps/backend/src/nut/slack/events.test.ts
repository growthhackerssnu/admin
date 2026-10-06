import { beforeEach, describe, expect, it, vi } from "vitest";

const createClaim = vi.fn(async () => "claim-slack-Fx1");
vi.mock("@/lib/prisma", () => ({ prisma: { member: { findUnique: vi.fn(async () => null) } } }));
const findRefundAccount = vi.fn<(email?: string, name?: string) => Promise<{ name: string; bankAccount: string } | null>>(
  async () => ({ name: "김주형", bankAccount: "토스뱅크 1000-0000-0000" }),
);
vi.mock("@/nut/lib/financeRepository", () => ({
  createClaim,
  findRefundAccount,
  resolvePeriodId: vi.fn(async () => "2026-2h"),
}));

// Slack Web API 흉내: 토큰 "good"만 GH NUT 앱(A0C802VMHK2)이 발급받은 것으로 답한다.
// 실제 워크플로 토큰처럼 auth.test에는 bot_id가 없고, 봇 사용자(UBOT)의 프로필에 앱 id가 있다.
const calls: string[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split("/").pop()!;
    calls.push(method);
    const good = String((init.headers as Record<string, string>).Authorization) === "Bearer good";
    const user = init.body instanceof URLSearchParams ? init.body.get("user") : null;
    const body =
      method === "auth.test"
        ? good
          ? { ok: true, user_id: "UBOT", team_id: "T1" }
          : { ok: false, error: "invalid_auth" }
        : method === "users.info"
          ? user === "UBOT"
            ? { ok: true, user: { is_bot: true, profile: { api_app_id: "A0C802VMHK2" } } }
            : { ok: true, user: { real_name: "홍 길동", profile: {} } }
          : { ok: true };
    return new Response(JSON.stringify(body));
  }),
);

const recordRollCall = vi.fn(async () => 2);
vi.mock("@/nut/lib/attendance", () => ({ recordRollCall, recordArrival: vi.fn(async () => "att-1") }));

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
    inputs: { claimant: "U1", date: "2026-10-06", detail: "루키 다과", amount: "23,500원" },
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
      expect.objectContaining({
        id: "claim-slack-Fx1",
        amount: 23500,
        prepaid: true,
        // 환급 계좌 명단에서 찾은 사람의 이름과 계좌를 쓴다.
        claimant: "김주형",
        source: "Slack",
        bankAccount: "토스뱅크 1000-0000-0000",
      }),
    );
    expect(findRefundAccount).toHaveBeenCalledWith(undefined, "홍 길동");
    expect(calls).toContain("functions.completeSuccess");
  });

  it("uses the Slack name without spaces when the person is not in the refund list", async () => {
    findRefundAccount.mockResolvedValueOnce(null);
    await post(step("good"));
    expect(createClaim).toHaveBeenCalledWith("2026-2h", expect.objectContaining({ claimant: "홍길동", bankAccount: null }));
  });

  it("records the roll call's lists under the roster names", async () => {
    await post({
      type: "event_callback",
      event: {
        type: "function_executed",
        function: { callback_id: "record_roll_call" },
        function_execution_id: "Fx2",
        bot_access_token: "good",
        inputs: { project: "에듀세션", unexcused_late: ["U1"], excused_absent: ["U2"] },
      },
    });
    expect(recordRollCall).toHaveBeenCalledWith("Fx2", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "에듀세션", [
      { people: [{ name: "김주형", email: null }], type: "absent", excuse: "excused" },
      { people: [], type: "late", excuse: "excused" },
      { people: [], type: "absent", excuse: "unexcused" },
      { people: [{ name: "김주형", email: null }], type: "late", excuse: "unexcused" },
    ]);
    expect(calls).toContain("functions.completeSuccess");
  });

  it("rejects a forged event whose token Slack does not recognize", async () => {
    const res = await post(step("forged"));
    expect(res.status).toBe(401);
    expect(createClaim).not.toHaveBeenCalled();
  });
});
