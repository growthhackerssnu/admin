import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  member: { id: "member-1", role: "acting", opsRole: "external_member" } as Record<string, unknown>,
  detail: vi.fn(),
  idempotency: vi.fn(),
  prisma: { acquisitionRound: { findFirst: vi.fn() }, outreach: { findFirst: vi.fn() } },
  tx: {
    company: { findUnique: vi.fn() },
    acquisitionRound: { findFirst: vi.fn() },
    outreach: { findFirst: vi.fn(), create: vi.fn() },
    sentMessage: { findFirst: vi.fn() },
    pastProject: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/dh/lib/listup/apiHandler", () => ({
  withListupApiHandler: (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, context: { params: unknown }) => handler(req, { member: mocks.member, params: context.params }),
}));
vi.mock("@/dh/lib/humanReview/outreach", () => ({ getHumanOutreachDetail: mocks.detail }));
vi.mock("@/dh/lib/idempotency", () => ({ withIdempotency: mocks.idempotency }));

import { POST } from "../../../../app/api/v1/companies/[companyId]/outreaches/route";

const start = (body: Record<string, unknown> = {}) => POST(new NextRequest("https://api.example.test/api/v1/companies/company-1/outreaches", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1" },
  body: JSON.stringify({ expectedRoundId: "round-1", ...body }),
}), { params: { companyId: "company-1" } });

describe("POST /companies/:id/outreaches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.idempotency.mockImplementation(async (_req, _member, _route, _payload, handler) => handler(mocks.tx));
    mocks.detail.mockImplementation(async (_tx, id) => ({ id }));
    mocks.tx.company.findUnique.mockResolvedValue({ id: "company-1", permanentlyExcluded: false });
    mocks.tx.acquisitionRound.findFirst.mockResolvedValue({ id: "round-1", targetQuarterId: "q-1" });
    mocks.tx.outreach.findFirst.mockResolvedValue(null);
    mocks.tx.sentMessage.findFirst.mockResolvedValue({ outreachId: "o-prev" });
    mocks.tx.pastProject.findFirst.mockResolvedValue(null);
    mocks.tx.outreach.create.mockResolvedValue({ id: "o-new" });
  });

  it("creates the member's own recontact task in the current round without touching candidates", async () => {
    const result = await start();
    expect(result.status).toBe(201);
    expect(mocks.tx.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-1", acquisitionRoundId: "round-1", currentTargetQuarterId: "q-1",
        ownerId: "member-1", route: "recontact", previousOutreachId: "o-prev", sendStatus: "before_send",
      }),
    });
    expect(mocks.tx.outreach.create.mock.calls[0]?.[0].data).not.toHaveProperty("candidateId");
  });

  it("returns the existing task as-is, even when someone else owns it", async () => {
    mocks.tx.outreach.findFirst.mockResolvedValue({ id: "o-existing" });
    const result = await start();
    expect(result).toMatchObject({ status: 200, body: { data: { id: "o-existing" } } });
    expect(mocks.tx.outreach.create).not.toHaveBeenCalled();
  });

  it("refuses when the client's round is no longer the current one", async () => {
    await expect(start({ expectedRoundId: "round-0" })).rejects.toMatchObject({ code: "ROUND_CHANGED" });
    expect(mocks.tx.outreach.create).not.toHaveBeenCalled();
  });

  it("refuses without any active round", async () => {
    mocks.tx.acquisitionRound.findFirst.mockResolvedValue(null);
    await expect(start()).rejects.toMatchObject({ code: "NO_ACTIVE_ROUND" });
  });

  it("uses repeat_collaboration for a company with a past project and allows no earlier send", async () => {
    mocks.tx.pastProject.findFirst.mockResolvedValue({ id: "p-1" });
    mocks.tx.sentMessage.findFirst.mockResolvedValue(null);
    await start({ entryPoint: "collaboration_history" });
    expect(mocks.tx.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ route: "repeat_collaboration", previousOutreachId: null }),
    });
  });

  it("rejects an entry point that does not match the company's history", async () => {
    await expect(start({ entryPoint: "collaboration_history" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    mocks.tx.pastProject.findFirst.mockResolvedValue({ id: "p-1" });
    await expect(start({ entryPoint: "contact_history" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a previous task from another company", async () => {
    mocks.tx.outreach.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(start({ previousOutreachId: "o-other" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns the winner's task when a concurrent start trips the unique constraint", async () => {
    mocks.idempotency.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    mocks.prisma.acquisitionRound.findFirst.mockResolvedValue({ id: "round-1" });
    mocks.prisma.outreach.findFirst.mockResolvedValue({ id: "o-winner" });
    await expect(start()).resolves.toMatchObject({ status: 200, body: { data: { id: "o-winner" } } });
  });
});
