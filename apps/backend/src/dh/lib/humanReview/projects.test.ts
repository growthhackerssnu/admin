import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  member: { id: "lead-1", role: "acting", opsRoles: [{ opsRole: "external_lead" }] } as Record<string, unknown>,
  idempotency: vi.fn(),
  prisma: { pastProject: { findUnique: vi.fn() } },
  tx: {
    company: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    outreach: { findUnique: vi.fn() },
    member: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    pastProject: { create: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/dh/lib/listup/apiHandler", () => ({
  withListupApiHandler: (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, context: { params: unknown }) => handler(req, { member: mocks.member, params: context.params }),
}));
vi.mock("@/dh/lib/idempotency", () => ({ withIdempotency: mocks.idempotency }));

import { POST } from "../../../../app/api/v1/projects/route";
import { PATCH } from "../../../../app/api/v1/projects/[projectId]/route";

const now = new Date("2026-10-03T00:00:00Z");
const row = (extra: Record<string, unknown> = {}) => ({
  id: "p-1", companyId: "c-1", title: "신규 프로젝트", year: 2027, quarter: 1, status: "in_progress", summary: null,
  ownerId: null, contactId: null, resultUrl: null, sourceOutreachId: null, version: 1, createdAt: now, updatedAt: now, ...extra,
});
const create = (body: Record<string, unknown> = {}) => POST(new NextRequest("https://api.example.test/api/v1/projects", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "k-1" },
  body: JSON.stringify({ company: { id: "c-1" }, title: "신규 프로젝트", year: 2027, quarter: 1, status: "in_progress", ...body }),
}), { params: {} });
const patch = (body: Record<string, unknown>) => PATCH(new NextRequest("https://api.example.test/api/v1/projects/p-1", {
  method: "PATCH",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "k-2" },
  body: JSON.stringify(body),
}), { params: { projectId: "p-1" } });

const source = (extra: Record<string, unknown> = {}) => ({
  id: "o-1", companyId: "c-1", version: 4, outcomeStatus: "won", sourcedProject: null,
  acquisitionRound: { targetQuarter: { year: 2027, quarter: 1 } }, ...extra,
});

describe("POST /projects", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.member = { id: "lead-1", role: "acting", opsRoles: [{ opsRole: "external_lead" }] };
    mocks.idempotency.mockImplementation(async (_req, _member, _route, _payload, handler) => handler(mocks.tx));
    mocks.tx.company.findUnique.mockResolvedValue({ id: "c-1" });
    mocks.tx.company.findMany.mockResolvedValue([]);
    mocks.tx.pastProject.create.mockImplementation(async ({ data }) => row(data));
  });

  it("only the external lead or an admin can register", async () => {
    mocks.member = { id: "m-1", role: "acting", opsRoles: [{ opsRole: "external_member" }] };
    await expect(create()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("saves a manually entered past project for an existing company with the registrant recorded and no source", async () => {
    const result = await create({ summary: "요약" });
    expect(result).toMatchObject({ status: 201, body: { data: { companyId: "c-1", status: "in_progress", version: 1 } } });
    expect(mocks.tx.pastProject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: "c-1", status: "in_progress", createdById: "lead-1", updatedById: "lead-1", sourceOutreachId: null }),
    });
  });

  it("requires a status, a title and a quarter, and rejects non-http result links", async () => {
    await expect(create({ status: undefined })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(create({ title: "  " })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(create({ quarter: 5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(create({ resultUrl: "javascript:alert(1)" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.tx.pastProject.create).not.toHaveBeenCalled();
  });

  it("never merges a new company into one with the same name and returns the candidates", async () => {
    mocks.tx.company.findMany.mockResolvedValue([{ id: "c-9", name: "Alpha" }]);
    await expect(create({ company: { name: "alpha" } })).rejects.toMatchObject({
      code: "ALREADY_EXISTS", details: { candidateCompanyIds: ["c-9"] },
    });
    expect(mocks.tx.company.create).not.toHaveBeenCalled();
    expect(mocks.tx.company.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: { equals: "alpha", mode: "insensitive" } },
    }));
  });

  it("creates a new company and its project together when the name is free", async () => {
    mocks.tx.company.create.mockResolvedValue({ id: "c-new" });
    await create({ company: { name: "새 기업", description: "설명" } });
    expect(mocks.tx.company.create).toHaveBeenCalledWith({ data: { name: "새 기업", product: "설명" } });
    expect(mocks.tx.pastProject.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: "c-new" }) });
  });

  it("rejects a contact that belongs to another company", async () => {
    mocks.tx.contact.findFirst.mockResolvedValue(null);
    await expect(create({ contactId: "contact-x" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.tx.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contact-x", companyId: "c-1" } }));
  });

  describe("from a won outreach", () => {
    const fromSource = (body: Record<string, unknown> = {}) => create({ sourceOutreachId: "o-1", expectedSourceOutreachVersion: 4, ...body });

    it("links the source and keeps the won outreach's quarter", async () => {
      mocks.tx.outreach.findUnique.mockResolvedValue(source());
      await fromSource();
      expect(mocks.tx.pastProject.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sourceOutreachId: "o-1" }) });
    });

    it("needs the source version", async () => {
      await expect(create({ sourceOutreachId: "o-1" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("refuses an outreach that is not won, was edited, or belongs to another company", async () => {
      mocks.tx.outreach.findUnique.mockResolvedValue(source({ outcomeStatus: "pending" }));
      await expect(fromSource()).rejects.toMatchObject({ code: "STATE_CONFLICT" });
      mocks.tx.outreach.findUnique.mockResolvedValue(source({ version: 5 }));
      await expect(fromSource()).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      mocks.tx.outreach.findUnique.mockResolvedValue(source({ companyId: "c-2" }));
      await expect(fromSource()).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.tx.pastProject.create).not.toHaveBeenCalled();
    });

    it("refuses a progress quarter that differs from the won outreach's target quarter", async () => {
      mocks.tx.outreach.findUnique.mockResolvedValue(source());
      await expect(fromSource({ quarter: 3 })).rejects.toMatchObject({ code: "VALIDATION_ERROR", details: { expectedQuarter: 1 } });
    });

    it("trusts the typed quarter when an old won outreach has no round to compare with", async () => {
      mocks.tx.outreach.findUnique.mockResolvedValue(source({ acquisitionRound: null }));
      await fromSource({ quarter: 3 });
      expect(mocks.tx.pastProject.create).toHaveBeenCalled();
    });

    it("reports the existing project instead of creating a second one for the same source", async () => {
      mocks.tx.outreach.findUnique.mockResolvedValue(source({ sourcedProject: { id: "p-existing" } }));
      await expect(fromSource()).rejects.toMatchObject({ code: "ALREADY_EXISTS", details: { projectId: "p-existing" } });
      expect(mocks.tx.pastProject.create).not.toHaveBeenCalled();
    });
  });
});

describe("PATCH /projects/:id", () => {
  const existing = (extra: Record<string, unknown> = {}) => ({ ...row(), sourceOutreach: null, ...extra });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.member = { id: "lead-1", role: "acting", opsRoles: [{ opsRole: "external_lead" }] };
    mocks.idempotency.mockImplementation(async (_req, _member, _route, _payload, handler) => handler(mocks.tx));
    mocks.prisma.pastProject.findUnique.mockResolvedValue({ id: "p-1" });
    mocks.tx.pastProject.findUniqueOrThrow
      .mockResolvedValueOnce(existing())
      .mockResolvedValue(row({ version: 2, status: "completed" }));
    mocks.tx.pastProject.updateMany.mockResolvedValue({ count: 1 });
  });

  it("is lead-only and needs at least one field", async () => {
    await expect(patch({ expectedVersion: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    mocks.member = { id: "m-1", role: "acting", opsRoles: [{ opsRole: "external_member" }] };
    await expect(patch({ expectedVersion: 1, status: "completed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 404 for an unknown project", async () => {
    mocks.prisma.pastProject.findUnique.mockResolvedValue(null);
    await expect(patch({ expectedVersion: 1, status: "completed" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("updates conditionally on the version and records the editor", async () => {
    const result = await patch({ expectedVersion: 1, status: "completed" });
    expect(result).toMatchObject({ status: 200, body: { data: { version: 2, status: "completed" } } });
    expect(mocks.tx.pastProject.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", version: 1 },
      data: { status: "completed", updatedById: "lead-1", version: { increment: 1 } },
    });
  });

  it("conflicts when the project changed since it was read, before or during the write", async () => {
    await expect(patch({ expectedVersion: 9, status: "completed" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    mocks.tx.pastProject.findUniqueOrThrow.mockReset().mockResolvedValue(existing());
    mocks.tx.pastProject.updateMany.mockResolvedValue({ count: 0 });
    await expect(patch({ expectedVersion: 1, status: "completed" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("will not move a project that came from a won outreach to another quarter", async () => {
    mocks.tx.pastProject.findUniqueOrThrow.mockReset().mockResolvedValue(existing({
      sourceOutreachId: "o-1", sourceOutreach: { acquisitionRound: { targetQuarter: { year: 2027, quarter: 1 } } },
    }));
    await expect(patch({ expectedVersion: 1, quarter: 2 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.tx.pastProject.updateMany).not.toHaveBeenCalled();
  });

  it("does not accept the company or the source in a patch", async () => {
    await expect(patch({ expectedVersion: 1, companyId: "c-2" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(patch({ expectedVersion: 1, sourceOutreachId: "o-9" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
