import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { requireExpectedRound } from "@/dh/lib/rounds";
import { prisma } from "@/lib/prisma";

const createInput = z.object({
  expectedRevision: z.number().int().positive(),
  expectedRoundId: z.string().min(1),
}).strict();

export const POST = withListupApiHandler<{ candidateId: string }>(async (req, { member, params }) => {
  const parsed = createInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "메시지 준비 요청이 올바르지 않습니다.");
  const current = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { reviewOwnerId: true, originCollectedCompanyId: true },
  });
  if (!current?.originCollectedCompanyId) throw new ApiError("NOT_FOUND", "검토 후보를 찾지 못했습니다.");
  requireReviewOwner(member, current.reviewOwnerId);
  const input = parsed.data;
  return withIdempotency(req, member, `/review-candidates/${params.candidateId}/outreaches`, input, async (tx) => {
    const candidate = await tx.candidate.findUniqueOrThrow({
      where: { id: params.candidateId },
      include: { selectedContact: true, selectedEndpoint: true, activeReviewDecision: true },
    });
    if (candidate.revision !== input.expectedRevision)
      throw new ApiError("REVISION_CONFLICT", "후보가 변경됐습니다. 다시 조회하세요.");
    if (
      candidate.reviewStatus !== "approved" ||
      candidate.activeReviewDecision?.action !== "approve" ||
      !candidate.selectedContact || !candidate.selectedEndpoint ||
      candidate.selectedContact.companyId !== candidate.companyId ||
      candidate.selectedEndpoint.companyId !== candidate.companyId ||
      candidate.selectedEndpoint.contactId !== candidate.selectedContact.id
    ) throw new ApiError("STATE_CONFLICT", "사람 승인과 유효 관계자가 필요합니다.");
    const round = await requireExpectedRound(tx, input.expectedRoundId);
    const existing = await tx.outreach.findFirst({
      where: { companyId: candidate.companyId, acquisitionRoundId: round.id },
      select: { id: true },
    });
    if (existing) throw new ApiError("OUTREACH_EXISTS", "이 기업의 메시지 업무가 이미 있습니다.", {
      details: { outreachId: existing.id },
    });
    const outreach = await tx.outreach.create({
      data: {
        companyId: candidate.companyId,
        candidateId: candidate.id,
        ownerId: member.id,
        acquisitionRoundId: round.id,
        currentTargetQuarterId: round.targetQuarterId,
        recipientContactId: candidate.selectedContact.id,
        recipientEndpointId: candidate.selectedEndpoint.id,
        selectedChannel: candidate.selectedEndpoint.channel,
        originSearchRunId: candidate.originSearchRunId,
        route: "new",
        workStage: "recipient_selection",
        internalDecision: "active",
        sendStatus: "before_send",
      },
    });
    return { status: 201, body: { data: await getHumanOutreachDetail(tx, outreach.id, member) } };
  });
});
