import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const syncInput = z.object({
  expectedVersion: z.number().int().positive(),
  expectedCandidateRevision: z.number().int().positive(),
}).strict();

export const PATCH = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = syncInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "수신자 반영 요청이 올바르지 않습니다.");
  const owner = await prisma.outreach.findUnique({ where: { id: params.outreachId }, select: { ownerId: true } });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, owner.ownerId);
  const input = parsed.data;
  return withIdempotency(req, member, `/review-outreaches/${params.outreachId}/recipient`, input, async (tx) => {
    const outreach = await tx.outreach.findUniqueOrThrow({
      where: { id: params.outreachId },
      include: {
        candidate: { include: { selectedContact: true, selectedEndpoint: true, activeReviewDecision: true } },
        sentMessages: { select: { id: true }, take: 1 },
      },
    });
    if (outreach.version !== input.expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
      throw new ApiError("STATE_CONFLICT", "발송 완료 후 수신자를 변경할 수 없습니다.");
    const candidate = outreach.candidate;
    if (
      !candidate || candidate.revision !== input.expectedCandidateRevision ||
      candidate.reviewStatus !== "approved" || candidate.activeReviewDecision?.action !== "approve" ||
      !candidate.selectedContact || !candidate.selectedEndpoint ||
      candidate.activeReviewDecision.contactId !== candidate.selectedContact.id ||
      candidate.activeReviewDecision.endpointId !== candidate.selectedEndpoint.id
    ) throw new ApiError("STATE_CONFLICT", "현재 승인된 수신자를 확인할 수 없습니다.");
    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: {
        recipientContactId: candidate.selectedContact.id,
        recipientEndpointId: candidate.selectedEndpoint.id,
        selectedChannel: candidate.selectedEndpoint.channel,
        selectionVersion: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    return { status: 200, body: { data: await getHumanOutreachDetail(tx, outreach.id) } };
  });
});
