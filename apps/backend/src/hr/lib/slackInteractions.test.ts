import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SLACK_GHEDIN_BOT_TOKEN = "xoxb-test";
process.env.SLACK_GHEDIN_SIGNING_SECRET = "secret";

// PR 팀원(m-pr, Slack U-PR)과 직책 없는 회원(m-x, Slack U-X). 요청 er1은 m-req가 냈다.
const members: Record<string, unknown> = {
  "pr@ghsnu.com": { id: "m-pr", role: "acting", active: true, opsRoles: [{ opsRole: "pr_member" }] },
  "x@ghsnu.com": { id: "m-x", role: "acting", active: true, opsRoles: [] },
};
const emails: Record<string, string> = { "U-PR": "pr@ghsnu.com", "U-X": "x@ghsnu.com" };
const editRequest = {
  id: "er1",
  status: "pending",
  requesterMemberId: "m-req",
  reviewNote: null as string | null,
  diff: { structuredFields: { 이메일: {} }, freeTextSections: { careers: {} } },
  requester: { displayName: "홍길동", claimedPersonEntry: { name: "홍길동", cohort: 15 } },
  reviewedBy: null,
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    member: {
      findFirst: vi.fn(async ({ where }: { where: { email: { equals: string } } }) => members[where.email.equals] ?? null),
    },
    editRequest: { findUnique: vi.fn(async () => editRequest) },
  },
}));

const approveEditRequest = vi.fn(async () => ({ ...editRequest, status: "approved" }));
const rejectEditRequest = vi.fn(async (_m: unknown, _id: string, reviewNote: string) => ({ ...editRequest, reviewNote }));
vi.mock("@/hr/lib/editRequestApproval", () => ({ approveEditRequest, rejectEditRequest }));

const calls: { method: string; body: Record<string, unknown> }[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split("/").pop()!;
    const body =
      init.body instanceof URLSearchParams
        ? Object.fromEntries(init.body)
        : (JSON.parse(String(init.body)) as Record<string, unknown>);
    calls.push({ method, body });
    if (method === "users.info")
      return new Response(JSON.stringify({ ok: true, user: { profile: { email: emails[String(body.user)] } } }));
    return new Response(JSON.stringify({ ok: true }));
  }),
);

const { POST } = await import("../../../app/api/slack/ghedin/interactions/route");

function post(payload: unknown, secret = "secret") {
  const raw = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex")}`;
  return POST(
    new Request("http://localhost/api/slack/ghedin/interactions", {
      method: "POST",
      headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig },
      body: raw,
    }),
  );
}

const click = (actionId: string, user = "U-PR") => ({
  type: "block_actions",
  user: { id: user },
  trigger_id: "T1",
  response_url: "https://hooks.slack.test/resp",
  container: { channel_id: "C1", message_ts: "1.1" },
  actions: [{ action_id: actionId, value: "er1" }],
});

describe("POST /api/slack/ghedin/interactions", () => {
  beforeEach(() => {
    calls.length = 0;
    approveEditRequest.mockClear();
    rejectEditRequest.mockClear();
  });

  it("rejects requests without a valid Slack signature", async () => {
    const res = await post(click("edit_request_approve"), "wrong");
    expect(res.status).toBe(401);
    expect(approveEditRequest).not.toHaveBeenCalled();
  });

  it("approves as the clicking PR member and replaces the buttons with the outcome", async () => {
    await post(click("edit_request_approve"));
    expect(approveEditRequest).toHaveBeenCalledWith(expect.objectContaining({ id: "m-pr" }), "er1");
    const update = calls.find((c) => c.method === "chat.update")!;
    expect(update.body).toMatchObject({ channel: "C1", ts: "1.1" });
    expect(JSON.stringify(update.body.blocks)).toContain("승인됨");
    expect(JSON.stringify(update.body.blocks)).not.toContain("edit_request_approve");
  });

  it("tells a non-reviewer they can't approve, without touching the request", async () => {
    await post(click("edit_request_approve", "U-X"));
    expect(approveEditRequest).not.toHaveBeenCalled();
    const reply = calls.find((c) => c.method === "resp")!;
    expect(reply.body).toMatchObject({ response_type: "ephemeral" });
  });

  it("asks for a reason before rejecting, then rejects with it", async () => {
    await post(click("edit_request_reject"));
    const open = calls.find((c) => c.method === "views.open")!;
    const view = open.body.view as { private_metadata: string; callback_id: string };
    expect(rejectEditRequest).not.toHaveBeenCalled();

    const res = await post({
      type: "view_submission",
      user: { id: "U-PR" },
      view: {
        callback_id: view.callback_id,
        private_metadata: view.private_metadata,
        state: { values: { reason: { value: { value: "링크가 깨졌어요" } } } },
      },
    });
    expect(res.status).toBe(200);
    expect(rejectEditRequest).toHaveBeenCalledWith(expect.objectContaining({ id: "m-pr" }), "er1", "링크가 깨졌어요");
    expect(JSON.stringify(calls.find((c) => c.method === "chat.update")!.body.blocks)).toContain("링크가 깨졌어요");
  });
});
