import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  member: { id: "member-1", role: "acting", opsRoles: [{ opsRole: "external_member" }] },
  owner: vi.fn(),
  detail: vi.fn(),
  idempotency: vi.fn(),
  tx: {
    candidate: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    contact: { create: vi.fn(), updateMany: vi.fn() },
    contactEndpoint: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    candidateReviewDecision: { create: vi.fn() },
    outreach: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: { candidate: { findUnique: mocks.owner } } }));
vi.mock("@/dh/lib/listup/apiHandler", () => ({
  withListupApiHandler: (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, context: { params: unknown }) => handler(req, { member: mocks.member, params: context.params }),
}));
vi.mock("@/dh/lib/humanReview/detail", () => ({ getReviewCandidateDetail: mocks.detail }));
vi.mock("@/dh/lib/idempotency", () => ({ withIdempotency: mocks.idempotency }));

import { PUT } from "../../../../app/api/v1/review-candidates/[candidateId]/recipient/route";

const address = "https://www.linkedin.com/in/example-person";
const contact = { id: "contact-1", companyId: "company-1", name: "기존 이름", title: "기존 직함" };
const endpoint = { id: "endpoint-1", contactId: contact.id, contact };
const save = (input: Record<string, unknown> = {}) => PUT(new NextRequest("https://api.example.test/api/v1/review-candidates/candidate-1/recipient", {
  method: "PUT",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1" },
  body: JSON.stringify({ expectedRevision: 2, name: "수정 이름", title: "수정 직함", channel: "linkedin", address, ...input }),
}), { params: { candidateId: "candidate-1" } });

describe("review candidate recipient writes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.owner.mockResolvedValue({ reviewOwnerId: mocks.member.id, originCollectedCompanyId: "collected-1" });
    mocks.tx.candidate.findUniqueOrThrow.mockResolvedValue({ companyId: "company-1", selectedContactId: contact.id });
    mocks.tx.candidate.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.contact.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.contactEndpoint.findUnique.mockResolvedValue(endpoint);
    mocks.tx.contactEndpoint.create.mockResolvedValue({ id: "endpoint-2", contactId: contact.id });
    mocks.detail.mockResolvedValue({ id: "candidate-1", revision: 3 });
    mocks.idempotency.mockImplementation(async (_req, _member, _route, _payload, handler) => handler(mocks.tx));
  });

  it("updates the selected person's name and title without creating another person", async () => {
    await expect(save({ contactId: contact.id })).resolves.toMatchObject({ status: 200 });
    expect(mocks.tx.contact.updateMany).toHaveBeenCalledWith({
      where: { id: contact.id, companyId: "company-1" }, data: { name: "수정 이름", title: "수정 직함" },
    });
    expect(mocks.tx.contact.create).not.toHaveBeenCalled();
    expect(mocks.tx.contactEndpoint.create).not.toHaveBeenCalled();
    expect(mocks.idempotency.mock.calls[0]?.[5]).toEqual({ maxWait: 10_000, timeout: 15_000 });
  });

  it("keeps the same person when editing their address and preserves the previous endpoint", async () => {
    mocks.tx.contactEndpoint.findUnique.mockResolvedValue(null);
    await save({ contactId: contact.id, address: "https://www.linkedin.com/in/new-address" });
    expect(mocks.tx.contactEndpoint.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contactId: contact.id, address: "https://www.linkedin.com/in/new-address" }),
    }));
    expect(mocks.tx.contact.create).not.toHaveBeenCalled();
    expect(mocks.tx.contactEndpoint.update).not.toHaveBeenCalled();
  });

  it("does not merge into another person's endpoint during an edit", async () => {
    mocks.tx.contactEndpoint.findUnique.mockResolvedValue({ ...endpoint, contactId: "another-person", contact: { ...contact, id: "another-person" } });
    await expect(save({ contactId: contact.id })).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    expect(mocks.tx.contact.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a contact ID that is not currently selected", async () => {
    await expect(save({ contactId: "another-person" })).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    expect(mocks.tx.candidate.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.contact.updateMany).not.toHaveBeenCalled();
  });

  it("still rejects conflicting identity information when adding instead of explicitly editing", async () => {
    await expect(save()).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    expect(mocks.tx.contact.updateMany).not.toHaveBeenCalled();
  });

  it("creates a distinct person for a new address without an edit target", async () => {
    mocks.tx.contactEndpoint.findUnique.mockResolvedValue(null);
    mocks.tx.contact.create.mockResolvedValue({ id: "new-person" });
    await save();
    expect(mocks.tx.contact.create).toHaveBeenCalledWith({ data: { companyId: "company-1", name: "수정 이름", title: "수정 직함" } });
    expect(mocks.tx.contactEndpoint.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contactId: "new-person" }) }));
  });

  it("does not edit contacts after a revision conflict", async () => {
    mocks.tx.candidate.updateMany.mockResolvedValue({ count: 0 });
    await expect(save({ contactId: contact.id })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(mocks.tx.contact.updateMany).not.toHaveBeenCalled();
  });

  describe("after approval", () => {
    const openWork = { id: "work-1", version: 4, sendStatus: "before_send", acquisitionRound: { endedAt: null }, sentMessages: [] };
    const approved = (outreaches: unknown[]) => mocks.tx.candidate.findUniqueOrThrow.mockResolvedValue({
      companyId: "company-1", selectedContactId: contact.id, reviewStatus: "approved", currentResearchId: "research-1",
      activeReviewDecision: { note: "판단 메모" }, outreaches,
    });
    beforeEach(() => {
      mocks.tx.candidateReviewDecision.create.mockResolvedValue({ id: "decision-2" });
      mocks.tx.outreach.updateMany.mockResolvedValue({ count: 1 });
    });

    it("keeps the approval, records it again with the new recipient, and updates the open work", async () => {
      approved([openWork]);
      await expect(save({ contactId: contact.id })).resolves.toMatchObject({ status: 200 });
      expect(mocks.tx.candidate.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ reviewStatus: "approved" }), data: { revision: { increment: 1 } },
      });
      expect(mocks.tx.candidateReviewDecision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        action: "approve", contactId: contact.id, endpointId: endpoint.id, note: "판단 메모", decidedById: mocks.member.id,
      }) });
      expect(mocks.tx.candidate.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { selectedContactId: contact.id, selectedEndpointId: endpoint.id, activeReviewDecisionId: "decision-2" },
      }));
      expect(mocks.tx.outreach.updateMany).toHaveBeenCalledWith({
        where: { id: "work-1", version: 4, sendStatus: "before_send" },
        data: expect.objectContaining({ recipientContactId: contact.id, recipientEndpointId: endpoint.id, version: { increment: 1 } }),
      });
    });

    it("refuses once the message has been sent", async () => {
      approved([{ ...openWork, sendStatus: "sent" }]);
      await expect(save({ contactId: contact.id })).rejects.toMatchObject({ code: "STATE_CONFLICT" });
      expect(mocks.tx.candidate.updateMany).not.toHaveBeenCalled();
      expect(mocks.tx.contact.updateMany).not.toHaveBeenCalled();
    });

    it("leaves work in a closed round untouched and works without any work", async () => {
      approved([{ ...openWork, acquisitionRound: { endedAt: new Date() } }]);
      await expect(save({ contactId: contact.id })).resolves.toMatchObject({ status: 200 });
      approved([]);
      await expect(save({ contactId: contact.id })).resolves.toMatchObject({ status: 200 });
      expect(mocks.tx.outreach.updateMany).not.toHaveBeenCalled();
    });
  });
});
