import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  member: { id: "lead-1", role: "acting", opsRole: "external_lead" } as Record<string, unknown>,
  idempotency: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    acquisitionRound: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    targetQuarter: { findUnique: vi.fn() },
    outreachOutcomeEvent: { createMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/dh/lib/listup/apiHandler", () => ({
  withListupApiHandler: (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, context: { params: unknown }) => handler(req, { member: mocks.member, params: context.params }),
}));
vi.mock("@/dh/lib/idempotency", () => ({ withIdempotency: mocks.idempotency }));

import { POST } from "../../../../app/api/v1/acquisition-rounds/route";

const quarter = (id: string) => ({ id, year: 2027, quarter: 1 });
const round = (id: string, targetQuarterId: string) => ({
  id, targetQuarterId, targetQuarter: quarter(targetQuarterId),
  startedAt: new Date("2026-10-01T00:00:00Z"), endedAt: null,
});
type Result = { status: number; body: { data: Record<string, unknown> } };
const set = async (body: Record<string, unknown>) => (await POST(new NextRequest("https://api.example.test/api/v1/acquisition-rounds", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1" },
  body: JSON.stringify(body),
}), { params: {} })) as unknown as Result;

describe("POST /acquisition-rounds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.member = { id: "lead-1", role: "acting", opsRole: "external_lead" };
    mocks.idempotency.mockImplementation(async (_req, _member, _route, _payload, handler) => handler(mocks.tx));
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.targetQuarter.findUnique.mockResolvedValue(quarter("q-next"));
    mocks.tx.acquisitionRound.create.mockImplementation(async ({ data }) => round("round-new", data.targetQuarterId));
  });

  it("rejects members who are not the external lead or an admin", async () => {
    mocks.member = { id: "m-2", role: "acting", opsRole: "external_member" };
    await expect(set({ targetQuarterId: "q-next", expectedActiveRoundId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the current round unchanged when the same quarter is set again", async () => {
    mocks.tx.acquisitionRound.findFirst.mockResolvedValue(round("round-1", "q-next"));
    const result = await set({ targetQuarterId: "q-next", expectedActiveRoundId: "round-1" });
    expect(result.status).toBe(200);
    expect(mocks.tx.acquisitionRound.create).not.toHaveBeenCalled();
    expect(mocks.tx.acquisitionRound.update).not.toHaveBeenCalled();
  });

  it("refuses a stale expectedActiveRoundId", async () => {
    mocks.tx.acquisitionRound.findFirst.mockResolvedValue(round("round-2", "q-old"));
    await expect(set({ targetQuarterId: "q-next", expectedActiveRoundId: "round-1" }))
      .rejects.toMatchObject({ code: "ROUND_CHANGED" });
    expect(mocks.tx.acquisitionRound.create).not.toHaveBeenCalled();
  });

  it("closes the old round, marks only the pending results unresolved, and starts the new round", async () => {
    mocks.tx.acquisitionRound.findFirst.mockResolvedValue(round("round-1", "q-old"));
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([]) // FOR UPDATE
      .mockResolvedValueOnce([{ id: "o-1" }, { id: "o-2" }]); // UPDATE ... RETURNING
    const result = await set({ targetQuarterId: "q-next", expectedActiveRoundId: "round-1" });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ closedRoundId: "round-1", unresolvedCount: 2 });
    const sql = String(mocks.tx.$queryRaw.mock.calls[1]?.[0].join("?"));
    expect(sql).toContain("send_status = 'sent'");
    expect(sql).toContain("outcome_status = 'pending'");
    expect(mocks.tx.outreachOutcomeEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ outreachId: "o-1", fromStatus: "pending", toStatus: "unresolved", source: "round_close", actorId: null }),
        expect.objectContaining({ outreachId: "o-2", source: "round_close" }),
      ],
    });
    expect(mocks.tx.acquisitionRound.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "round-1" }, data: expect.objectContaining({ closedById: "lead-1" }),
    }));
  });

  it("starts the first round when none is active", async () => {
    mocks.tx.acquisitionRound.findFirst.mockResolvedValue(null);
    const result = await set({ targetQuarterId: "q-next", expectedActiveRoundId: null });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ closedRoundId: null, unresolvedCount: 0 });
    expect(mocks.tx.outreachOutcomeEvent.createMany).not.toHaveBeenCalled();
  });
});
