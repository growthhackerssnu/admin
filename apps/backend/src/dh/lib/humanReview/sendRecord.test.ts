import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  member: { id: "member-1", role: "acting", opsRole: "external_member" } as Record<string, unknown>,
  idempotency: vi.fn(),
  prisma: { outreach: { findUnique: vi.fn() } },
  tx: {
    outreach: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    companyResearch: { findFirst: vi.fn() },
    pastProject: { findMany: vi.fn() },
    messageDraftRevision: { findUnique: vi.fn() },
    outreachOutcomeEvent: { create: vi.fn() },
    sentMessage: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/dh/lib/listup/apiHandler", () => ({
  withListupApiHandler: (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, context: { params: unknown }) => handler(req, { member: mocks.member, params: context.params }),
}));
vi.mock("@/dh/lib/idempotency", () => ({ withIdempotency: mocks.idempotency }));

import { POST } from "../../../../app/api/v1/review-outreaches/[outreachId]/send-records/route";

const sentAt = new Date("2026-10-03T01:00:00Z");
const outreach = {
  id: "o-1", companyId: "c-1", version: 4, sendStatus: "before_send", sentMessages: [],
  currentRevision: 2, candidate: null, acquisitionRoundId: "round-1", acquisitionRound: { endedAt: null },
  contactPurpose: "재연락", currentTargetQuarterId: "q-1", recipientContactId: "contact-1", recipientEndpointId: "endpoint-1",
  recipientContact: { id: "contact-1", name: "김" }, recipientEndpoint: { id: "endpoint-1", channel: "email", address: "a@b.co" },
};
const draft = {
  revision: 2, subject: "s", body: "b", templateId: null, templateVersion: null,
  generationResearchId: null, generationReviewDecisionId: null, recipientContactId: "contact-1",
  recipientEndpointId: "endpoint-1", targetQuarterId: "q-1", contactPurposeSnapshot: "재연락", generationHistory: null,
};
const send = () => POST(new NextRequest("https://api.example.test/api/v1/review-outreaches/o-1/send-records", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1" },
  body: JSON.stringify({ expectedVersion: 4, draftRevision: 2 }),
}), { params: { outreachId: "o-1" } });

describe("review outreach send record", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.outreach.findUnique.mockResolvedValue({ ownerId: "member-1" });
    mocks.idempotency.mockImplementation(async (_req, _member, _route, _payload, handler) => handler(mocks.tx));
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue(outreach);
    mocks.tx.outreach.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.outreach.findMany.mockResolvedValue([]);
    mocks.tx.pastProject.findMany.mockResolvedValue([]);
    mocks.tx.companyResearch.findFirst.mockResolvedValue({ id: "r-1" });
    mocks.tx.messageDraftRevision.findUnique.mockResolvedValue({ ...draft, generationResearchId: "r-1", generationHistory: { key: "ignored" } });
    mocks.tx.sentMessage.create.mockResolvedValue({
      id: "s-1", outreachId: "o-1", targetQuarterId: "q-1", channel: "email", recipientNameSnapshot: "김",
      addressSnapshot: "a@b.co", subjectSnapshot: "s", bodySnapshot: "b", draftRevision: 2, sentAt,
      createdAt: sentAt, recordedById: "member-1",
    });
  });

  it("stores the send, the pending result, and its history event together", async () => {
    // 이전 발송이 없는 재연락의 history는 빈 배열이라 key가 있어야 하므로 초안의 key를 맞춘다.
    const { loadOutreachContext } = await import("./context");
    const ctx = await loadOutreachContext(mocks.tx as never, outreach as never);
    mocks.tx.messageDraftRevision.findUnique.mockResolvedValue({ ...draft, generationResearchId: "r-1", generationHistory: ctx.history });
    const result = await send();
    expect(result).toMatchObject({ status: 201, body: { data: { outreachVersion: 5, outcomeStatus: "pending" } } });
    expect(mocks.tx.outreach.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sendStatus: "sent", outcomeStatus: "pending" }),
    }));
    expect(mocks.tx.outreachOutcomeEvent.create).toHaveBeenCalledWith({
      data: { outreachId: "o-1", fromStatus: null, toStatus: "pending", source: "send_record", actorId: "member-1" },
    });
  });

  it("refuses to record a send in a closed round", async () => {
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue({ ...outreach, acquisitionRound: { endedAt: new Date() } });
    await expect(send()).rejects.toMatchObject({ code: "ROUND_CLOSED" });
    expect(mocks.tx.sentMessage.create).not.toHaveBeenCalled();
  });

  it("refuses a second send for the same task without a second pending event", async () => {
    mocks.tx.outreach.findUniqueOrThrow.mockResolvedValue({ ...outreach, sendStatus: "sent", sentMessages: [{ id: "s-1" }] });
    await expect(send()).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    expect(mocks.tx.outreachOutcomeEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a draft made before the contact history changed", async () => {
    await expect(send()).rejects.toMatchObject({ code: "DRAFT_CONTEXT_CHANGED" });
    expect(mocks.tx.sentMessage.create).not.toHaveBeenCalled();
  });
});
