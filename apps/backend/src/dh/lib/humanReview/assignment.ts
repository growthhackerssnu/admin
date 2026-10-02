import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";
import { assignableCandidateWhere } from "./access";

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const assignmentInput = z.object({
  workStartsOn: dateText,
  workEndsOn: dateText,
  memberIds: z.array(z.string().min(1)).min(1).max(30),
  perMemberCount: z.number().int().positive().max(100),
}).strict();

export const assignmentConfirmInput = assignmentInput.extend({
  items: z.array(z.object({ candidateId: z.string().min(1), memberId: z.string().min(1) }).strict())
    .min(1).max(3000),
}).strict();

export function validateAssignmentInput(input: z.infer<typeof assignmentInput>) {
  const start = new Date(`${input.workStartsOn}T00:00:00.000Z`);
  const end = new Date(`${input.workEndsOn}T00:00:00.000Z`);
  if (
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
    start.toISOString().slice(0, 10) !== input.workStartsOn ||
    end.toISOString().slice(0, 10) !== input.workEndsOn ||
    start > end || new Set(input.memberIds).size !== input.memberIds.length
  ) throw new ApiError("VALIDATION_ERROR", "작업 기간 또는 참여 팀원 목록이 올바르지 않습니다.");
  return { start, end, selectedCount: input.memberIds.length * input.perMemberCount };
}

export async function validateAssignmentMembers(
  tx: Prisma.TransactionClient,
  memberIds: string[],
) {
  const members = await tx.member.findMany({
    where: {
      id: { in: memberIds },
      active: true,
      role: "acting",
      opsRole: "external_member",
    },
    select: { id: true },
  });
  if (members.length !== memberIds.length)
    throw new ApiError("VALIDATION_ERROR", "활성 대외협력 팀원만 배정할 수 있습니다.");
}

export async function assignmentPreview(
  tx: Prisma.TransactionClient,
  input: z.infer<typeof assignmentInput>,
) {
  const { selectedCount } = validateAssignmentInput(input);
  await validateAssignmentMembers(tx, input.memberIds);
  const [eligibleCount, rows] = await Promise.all([
    tx.candidate.count({ where: assignableCandidateWhere }),
    tx.candidate.findMany({
      where: assignableCandidateWhere,
      select: { id: true, company: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: selectedCount,
    }),
  ]);
  if (rows.length < selectedCount)
    throw new ApiError("INSUFFICIENT_CANDIDATES", "배정 가능한 기업이 요청한 총량보다 적습니다.", {
      details: { eligibleCount, selectedCount },
    });
  return {
    workStartsOn: input.workStartsOn,
    workEndsOn: input.workEndsOn,
    memberIds: input.memberIds,
    eligibleCount,
    perMemberCount: input.perMemberCount,
    selectedCount,
    items: rows.map((row, index) => ({
      candidateId: row.id,
      companyName: row.company.name,
      memberId: input.memberIds[index % input.memberIds.length],
    })),
  };
}

export function serializeAssignmentBatch(row: {
  id: string;
  workStartsOn: Date;
  workEndsOn: Date;
  snapshotAt: Date;
  eligibleCountAtSnapshot: number;
  perMemberCount: number;
  selectedMemberCount: number;
  createdBy: { id: string; displayName: string };
  items: {
    candidateId: string;
    memberId: string;
    assignedAt: Date;
    candidate: { reviewStatus: string | null };
  }[];
}) {
  return {
    id: row.id,
    workStartsOn: row.workStartsOn.toISOString().slice(0, 10),
    workEndsOn: row.workEndsOn.toISOString().slice(0, 10),
    snapshotAt: row.snapshotAt.toISOString(),
    eligibleCountAtSnapshot: row.eligibleCountAtSnapshot,
    perMemberCount: row.perMemberCount,
    selectedMemberCount: row.selectedMemberCount,
    createdBy: { id: row.createdBy.id, name: row.createdBy.displayName },
    items: row.items.map((item) => ({
      candidateId: item.candidateId,
      memberId: item.memberId,
      assignedAt: item.assignedAt.toISOString(),
      reviewStatus: item.candidate.reviewStatus,
    })),
  };
}
