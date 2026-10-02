import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead, assignableCandidateWhere } from "@/dh/lib/humanReview/access";
import {
  assignmentConfirmInput,
  serializeAssignmentBatch,
  validateAssignmentInput,
  validateAssignmentMembers,
} from "@/dh/lib/humanReview/assignment";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";

export const POST = withListupApiHandler(async (req, { member }) => {
  requireExternalLead(member);
  const parsed = assignmentConfirmInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "배정 확정 입력이 올바르지 않습니다.");
  const input = parsed.data;
  const { start, end, selectedCount } = validateAssignmentInput(input);
  const candidateIds = input.items.map((item) => item.candidateId);
  if (
    input.items.length !== selectedCount ||
    new Set(candidateIds).size !== selectedCount ||
    input.items.some((item, index) => item.memberId !== input.memberIds[index % input.memberIds.length])
  ) throw new ApiError("VALIDATION_ERROR", "미리보기의 기업·담당자 배분과 요청 총량이 일치하지 않습니다.");

  return withIdempotency(req, member, "/review-assignment-batches", input, async (tx) => {
    await validateAssignmentMembers(tx, input.memberIds);
    const candidates = await tx.candidate.findMany({
      where: { AND: [assignableCandidateWhere, { id: { in: candidateIds } }] },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (
      candidates.length !== selectedCount ||
      candidates.some((candidate, index) => candidate.id !== candidateIds[index])
    ) throw new ApiError("PREVIEW_EXPIRED", "후보 상태가 바뀌었습니다. 배정을 다시 미리보세요.");

    const eligibleCountAtSnapshot = await tx.candidate.count({ where: assignableCandidateWhere });
    const batch = await tx.reviewAssignmentBatch.create({
      data: {
        workStartsOn: start,
        workEndsOn: end,
        snapshotAt: new Date(),
        eligibleCountAtSnapshot,
        perMemberCount: input.perMemberCount,
        selectedMemberCount: input.memberIds.length,
        createdById: member.id,
      },
    });
    for (const memberId of input.memberIds) {
      const assignedCandidateIds = input.items
        .filter((item) => item.memberId === memberId)
        .map((item) => item.candidateId);
      const changed = await tx.candidate.updateMany({
        where: { AND: [assignableCandidateWhere, { id: { in: assignedCandidateIds } }] },
        data: { reviewOwnerId: memberId, revision: { increment: 1 } },
      });
      if (changed.count !== assignedCandidateIds.length)
        throw new ApiError("ASSIGNMENT_CONFLICT", "다른 배정이 먼저 확정됐습니다. 다시 미리보세요.");
    }
    await tx.reviewAssignmentItem.createMany({
      data: input.items.map((item) => ({
        batchId: batch.id,
        candidateId: item.candidateId,
        memberId: item.memberId,
      })),
    });
    const saved = await tx.reviewAssignmentBatch.findUniqueOrThrow({
      where: { id: batch.id },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        items: { include: { candidate: { select: { reviewStatus: true } } }, orderBy: { assignedAt: "asc" } },
      },
    });
    return { status: 201, body: { data: serializeAssignmentBatch(saved) } };
  });
});
