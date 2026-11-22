import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  member: { id: "member-1", role: "acting", opsRoles: [{ opsRole: "external_member" }] } as Record<string, unknown>,
  idempotency: vi.fn(),
  prisma: { outreach: { findUnique: vi.fn() } },
  tx: {
    outreach: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    sentMessage: { deleteMany: vi.fn() },
    outreachOutcomeEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/dh/lib/listup/apiHandler", () => ({
  withListupApiHandler: (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, context: { params: unknown }) => handler(req, { member: mocks.member, params: context.params }),
}));
vi.mock("@/dh/lib/idempotency", () => ({ withIdempotency: mocks.idempotency }));

import { POST } from "../../../../app/api/v1/review-outreaches/[outreachId]/send-cancellation/route";

const sentAt = new Date("2026-11-19T12:00:00Z");
const sentOutreach = {
  id: "o-1", version: 5, sendStatus: "sent", outcomeStatus: "pending",
  acquisitionRound: { endedAt: null },
  sentMessages: [{ id: "s-1", sentAt, recipientNameSnapshot: "김", channel: "linkedin" }],
  responses: [], outcomeEvents: [],
};
const cancel = (body: unknown = { expectedVersion: 5 }) => POST(new NextRequest("https://api.example.test/api/v1/review-outreaches/o-1/send-cancellation", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1" },
  body: JSON.stringify(body),
}), { params: { outreachId: "o-1" } });

describe("review outreach send cancellation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.member.id = "member-1";
    mocks.member.opsRoles = [{ opsRole: "external_member" }];
    mocks.prisma.outreach.findUnique.mockResolvedValue({ ownerId: "member-1" });
    mocks.idempotency.mockImplementation(async (_req, _member, _route, _payload, handler) => handler(mocks.tx));
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue(sentOutreach);
    mocks.tx.outreach.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.sentMessage.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("발송 기록을 지우고 작업을 발송 전으로 되돌린 뒤 취소 이력을 남긴다", async () => {
    await expect(cancel()).resolves.toEqual({
      status: 200,
      body: { data: { outreachId: "o-1", outreachVersion: 6, sendStatus: "before_send" } },
    });
    expect(mocks.tx.outreach.updateMany).toHaveBeenCalledWith({
      where: { id: "o-1", version: 5, sendStatus: "sent", outcomeStatus: "pending" },
      data: {
        sendStatus: "before_send", workStage: "draft_review", lastSentQuarterId: null,
        outcomeStatus: null, version: { increment: 1 },
      },
    });
    expect(mocks.tx.sentMessage.deleteMany).toHaveBeenCalledWith({ where: { outreachId: "o-1" } });
    expect(mocks.tx.outreachOutcomeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outreachId: "o-1", fromStatus: "pending", toStatus: "pending", source: "send_cancel", actorId: "member-1",
      }),
    });
  });

  it("팀장은 다른 담당자의 발송도 취소할 수 있다", async () => {
    mocks.prisma.outreach.findUnique.mockResolvedValue({ ownerId: "member-2" });
    mocks.member.opsRoles = [{ opsRole: "external_lead" }];
    await expect(cancel()).resolves.toMatchObject({ status: 200 });
  });

  it("담당자도 팀장도 아니면 막는다", async () => {
    mocks.prisma.outreach.findUnique.mockResolvedValue({ ownerId: "member-2" });
    await expect(cancel()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.tx.outreach.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["회신 상태를 바꾼 뒤", { outcomeStatus: "in_discussion" }],
    ["사람이 상태를 기록했다가 회신 대기로 되돌린 뒤", { outcomeEvents: [{ id: "e-1" }] }],
    ["응답을 기록한 뒤", { responses: [{ id: "r-1" }] }],
  ])("%s에는 취소할 수 없다", async (_label, patch) => {
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue({ ...sentOutreach, ...patch });
    await expect(cancel()).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    expect(mocks.tx.sentMessage.deleteMany).not.toHaveBeenCalled();
  });

  it("종료된 회차의 발송은 취소할 수 없다", async () => {
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue({ ...sentOutreach, acquisitionRound: { endedAt: new Date() } });
    await expect(cancel()).rejects.toMatchObject({ code: "ROUND_CLOSED" });
  });

  it("발송 전 작업과 바뀐 버전은 막는다", async () => {
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue({ ...sentOutreach, sendStatus: "before_send", sentMessages: [] });
    await expect(cancel()).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue(sentOutreach);
    await expect(cancel({ expectedVersion: 4 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
