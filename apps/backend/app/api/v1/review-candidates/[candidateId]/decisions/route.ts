import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getReviewCandidateDetail } from "@/dh/lib/humanReview/detail";
import { serializeReviewDecision } from "@/dh/lib/humanReview/serializers";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const decisionInput = z.object({
  expectedRevision: z.number().int().positive(),
  action: z.enum(["approve", "reject_fit", "reject_contact", "reopen"]),
  note: z.string().trim().max(2000).optional(),
}).strict();

export const POST = withListupApiHandler<{ candidateId: string }>(async (req, { member, params }) => {
  const parsed = decisionInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "검토 판단 입력이 올바르지 않습니다.");
  const owner = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { reviewOwnerId: true, originCollectedCompanyId: true },
  });
  if (!owner?.originCollectedCompanyId) throw new ApiError("NOT_FOUND", "검토 후보를 찾지 못했습니다.");
  requireReviewOwner(member, owner.reviewOwnerId);
  const input = parsed.data;

  return withIdempotency(req, member, `/review-candidates/${params.candidateId}/decisions`, input, async (tx) => {
    const candidate = await tx.candidate.findUniqueOrThrow({
      where: { id: params.candidateId },
      include: { selectedContact: true, selectedEndpoint: true },
    });
    if (candidate.revision !== input.expectedRevision)
      throw new ApiError("REVISION_CONFLICT", "후보가 변경됐습니다. 새로고침 후 다시 판단하세요.");
    if (candidate.researchStatus !== "ready" || !candidate.currentResearchId)
      throw new ApiError("STATE_CONFLICT", "조사가 준비된 후보만 판단할 수 있습니다.");
    const complete = ["approved", "rejected_fit", "rejected_contact"].includes(candidate.reviewStatus ?? "");
    if (input.action === "reopen" ? !complete : complete)
      throw new ApiError("STATE_CONFLICT", "현재 상태에서 이 판단을 저장할 수 없습니다.");
    if (input.action === "approve" && (
      !candidate.selectedContact || !candidate.selectedEndpoint ||
      candidate.selectedContact.companyId !== candidate.companyId ||
      candidate.selectedEndpoint.companyId !== candidate.companyId ||
      candidate.selectedEndpoint.contactId !== candidate.selectedContact.id
    )) throw new ApiError("STATE_CONFLICT", "승인 전에 유효한 관계자를 저장해야 합니다.");

    const decision = await tx.candidateReviewDecision.create({
      data: {
        candidateId: candidate.id,
        action: input.action,
        fit: input.action === "reject_fit" ? "unfit" :
          input.action === "reopen" ? null : "fit",
        contactResult: input.action === "approve" ? "confirmed" :
          input.action === "reject_contact" ? "not_found" : "unchecked",
        researchId: candidate.currentResearchId,
        contactId: input.action === "approve" ? candidate.selectedContactId : null,
        endpointId: input.action === "approve" ? candidate.selectedEndpointId : null,
        note: input.note ?? null,
        decidedById: member.id,
      },
      include: { decidedBy: { select: { id: true, displayName: true } } },
    });
    const nextStatus = input.action === "approve" ? "approved" :
      input.action === "reject_fit" ? "rejected_fit" :
      input.action === "reject_contact" ? "rejected_contact" : "reviewing";
    const changed = await tx.candidate.updateMany({
      where: { id: candidate.id, reviewOwnerId: member.id, revision: input.expectedRevision },
      data: {
        reviewStatus: nextStatus,
        activeReviewDecisionId: decision.id,
        ...(input.action === "reject_contact" ? {
          selectedContactId: null,
          selectedEndpointId: null,
        } : {}),
        revision: { increment: 1 },
      },
    });
    if (!changed.count) throw new ApiError("REVISION_CONFLICT", "후보가 변경됐습니다. 다시 조회하세요.");
    return {
      status: 201,
      body: {
        data: {
          candidate: await getReviewCandidateDetail(tx, candidate.id, member.id),
          decision: serializeReviewDecision(decision),
        },
      },
    };
  }, { maxWait: 10_000, timeout: 15_000 });
});
