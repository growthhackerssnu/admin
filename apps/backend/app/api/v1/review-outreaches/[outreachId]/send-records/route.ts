import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const sendInput = z.object({
  expectedVersion: z.number().int().positive(),
  draftRevision: z.number().int().positive(),
  sentAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export const POST = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = sendInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "발송 기록 요청이 올바르지 않습니다.");
  const owner = await prisma.outreach.findUnique({
    where: { id: params.outreachId },
    select: { ownerId: true },
  });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, owner.ownerId);
  const input = parsed.data;
  const sentAt = input.sentAt ? new Date(input.sentAt) : new Date();
  if (sentAt > new Date()) throw new ApiError("VALIDATION_ERROR", "미래 시각의 발송은 기록할 수 없습니다.");

  return withIdempotency(req, member, `/review-outreaches/${params.outreachId}/send-records`, input, async (tx) => {
    const outreach = await tx.outreach.findUniqueOrThrow({
      where: { id: params.outreachId },
      include: {
        candidate: true,
        recipientContact: true,
        recipientEndpoint: true,
        sentMessages: { select: { id: true }, take: 1 },
      },
    });
    if (outreach.version !== input.expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
      throw new ApiError("STATE_CONFLICT", "첫 발송은 이미 기록됐습니다.");
    if (
      outreach.currentRevision !== input.draftRevision ||
      !outreach.recipientContact || !outreach.recipientEndpoint ||
      outreach.candidate?.reviewStatus !== "approved"
    ) throw new ApiError("STATE_CONFLICT", "현재 승인·수신자·초안이 필요합니다.");
    const draft = await tx.messageDraftRevision.findUnique({
      where: { outreachId_revision: { outreachId: outreach.id, revision: input.draftRevision } },
    });
    if (
      !draft || draft.generationResearchId !== outreach.candidate.currentResearchId ||
      draft.generationReviewDecisionId !== outreach.candidate.activeReviewDecisionId ||
      draft.recipientContactId !== outreach.recipientContactId ||
      draft.recipientEndpointId !== outreach.recipientEndpointId ||
      draft.targetQuarterId !== outreach.currentTargetQuarterId ||
      (draft.contactPurposeSnapshot ?? null) !== (outreach.contactPurpose ?? null)
    ) throw new ApiError("DRAFT_CONTEXT_CHANGED", "현재 조사·수신자·분기와 초안이 다릅니다. 먼저 수정하거나 다시 생성하세요.");
    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: {
        sendStatus: "sent",
        workStage: "response_check",
        lastSentQuarterId: outreach.currentTargetQuarterId,
        version: { increment: 1 },
      },
    });
    if (!changed.count) throw new ApiError("STATE_CONFLICT", "다른 발송 기록이 먼저 저장됐습니다.");
    const sent = await tx.sentMessage.create({
      data: {
        outreachId: outreach.id,
        targetQuarterId: outreach.currentTargetQuarterId,
        channel: outreach.recipientEndpoint.channel,
        recipientContactId: outreach.recipientContact.id,
        recipientEndpointId: outreach.recipientEndpoint.id,
        recipientNameSnapshot: outreach.recipientContact.name,
        addressSnapshot: outreach.recipientEndpoint.address,
        subjectSnapshot: draft.subject,
        bodySnapshot: draft.body,
        templateId: draft.templateId,
        templateVersion: draft.templateVersion,
        draftRevision: draft.revision,
        recordedById: member.id,
        sentAt,
        status: "sent",
      },
    });
    return {
      status: 201,
      body: {
        data: {
          id: sent.id,
          outreachId: sent.outreachId,
          targetQuarterId: sent.targetQuarterId,
          channel: sent.channel,
          recipientNameSnapshot: sent.recipientNameSnapshot,
          addressSnapshot: sent.addressSnapshot,
          subjectSnapshot: sent.subjectSnapshot,
          bodySnapshot: sent.bodySnapshot,
          draftRevision: sent.draftRevision,
          sentAt: sent.sentAt.toISOString(),
          createdAt: sent.createdAt.toISOString(),
          recordedById: sent.recordedById,
        },
      },
    };
  });
});
