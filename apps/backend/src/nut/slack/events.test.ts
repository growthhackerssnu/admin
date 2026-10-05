import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/nut/lib/financeRepository", () => ({ createClaim: vi.fn(), resolvePeriodId: vi.fn() }));

const secret = "test-signing-secret";
function signed(body: string, at = Math.floor(Date.now() / 1000), key = secret) {
  const signature = "v0=" + createHmac("sha256", key).update(`v0:${at}:${body}`).digest("hex");
  return new Request("http://localhost/api/slack/events", {
    method: "POST",
    body,
    headers: { "x-slack-request-timestamp": String(at), "x-slack-signature": signature },
  });
}

describe("POST /api/slack/events", () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    process.env.SLACK_SIGNING_SECRET = secret;
    ({ POST } = await import("../../../app/api/slack/events/route"));
  });

  it("answers Slack's URL verification when the signature is valid", async () => {
    const res = await POST(signed(JSON.stringify({ type: "url_verification", challenge: "abc" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "abc" });
  });

  it("rejects a wrong secret, a stale timestamp, and a missing signature", async () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "abc" });
    expect((await POST(signed(body, undefined, "wrong"))).status).toBe(401);
    expect((await POST(signed(body, Math.floor(Date.now() / 1000) - 600))).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/slack/events", { method: "POST", body }))).status).toBe(401);
  });
});
