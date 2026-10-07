import { describe, expect, it, vi } from "vitest";
import type { Member, OpsRole, Prisma } from "@/generated/prisma";
import type { MemberWithOpsRoles } from "@/portal/lib/opsRoles";
import { assignmentPreview, validateAssignmentInput } from "./assignment";
import { requireExternalLead } from "./access";

const input = {
  workStartsOn: "2026-10-02",
  workEndsOn: "2026-10-09",
  memberIds: ["member-a", "member-b", "member-c"],
  perMemberCount: 2,
};

describe("fixed review assignment", () => {
  it("allocates an equal fixed count in queue order", async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `candidate-${index + 1}`,
      company: { name: `기업 ${index + 1}` },
    }));
    const findMany = vi.fn().mockResolvedValue(rows);
    const tx = {
      member: { findMany: vi.fn().mockResolvedValue(input.memberIds.map((id) => ({ id }))) },
      candidate: { count: vi.fn().mockResolvedValue(8), findMany },
    } as unknown as Prisma.TransactionClient;

    const preview = await assignmentPreview(tx, input);

    expect(preview.eligibleCount).toBe(8);
    expect(preview.memberIds).toEqual(input.memberIds);
    expect(preview.selectedCount).toBe(6);
    expect(preview.items.map((item) => item.memberId)).toEqual([
      "member-a", "member-b", "member-c", "member-a", "member-b", "member-c",
    ]);
    expect(preview.items.map((item) => item.candidateId)).toEqual(rows.map((row) => row.id));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 6,
    }));
  });

  it("rejects invalid dates and duplicate members", () => {
    expect(() => validateAssignmentInput({ ...input, workStartsOn: "2026-02-30" })).toThrow();
    expect(() => validateAssignmentInput({ ...input, workEndsOn: "2026-10-01" })).toThrow();
    expect(() => validateAssignmentInput({ ...input, memberIds: ["member-a", "member-a"] })).toThrow();
  });

  it("does not make a partial allocation when the queue is too small", async () => {
    const tx = {
      member: { findMany: vi.fn().mockResolvedValue(input.memberIds.map((id) => ({ id }))) },
      candidate: {
        count: vi.fn().mockResolvedValue(5),
        findMany: vi.fn().mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({
          id: `candidate-${index + 1}`, company: { name: `기업 ${index + 1}` },
        }))),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(assignmentPreview(tx, input)).rejects.toMatchObject({ code: "INSUFFICIENT_CANDIDATES" });
  });

  it("allows assignment changes only for an acting external lead or admin", () => {
    const member = (role: Member["role"], opsRole: OpsRole | null) =>
      ({ id: "m-1", role, opsRoles: opsRole ? [{ opsRole }] : [] }) as unknown as MemberWithOpsRoles;
    expect(() => requireExternalLead(member("acting", "external_lead"))).not.toThrow();
    expect(() => requireExternalLead(member("admin", null))).not.toThrow();
    expect(() => requireExternalLead(member("acting", "external_member"))).toThrow();
    expect(() => requireExternalLead(member("alumni", "external_lead"))).toThrow();
  });
});
