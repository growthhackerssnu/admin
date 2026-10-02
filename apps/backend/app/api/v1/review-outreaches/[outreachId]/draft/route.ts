import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner, requireExternalReader } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const contextRecipient = z.object({
  contactId: z.string().min(1),
  endpointId: z.string().min(1),
  name: z.string().min(1),
  title: z.string().nullable(),
  channel: z.enum(["linkedin", "email"]),
  address: z.string().min(1),
}).strict();
const saveInput = z.object({
  expectedVersion: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
  topic: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20000),
  contextResearchId: z.string().min(1).optional(),
  contextReviewDecisionId: z.string().min(1).optional(),
  contextTargetQuarterId: z.string().min(1).optional(),
  contextRecipient: contextRecipient.optional(),
}).strict();

export const GET = withListupApiHandler<{ outreachId: string }>(async (_req, { member, params }) => {
  requireExternalReader(member);
  const detail = await getHumanOutreachDetail(prisma, params.outreachId);
  return { body: { data: detail.draft } };
});

export const PATCH = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = saveInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "초안 수정 요청이 올바르지 않습니다.");
  const owner = await prisma.outreach.findUnique({
    where: { id: params.outreachId },
    select: { ownerId: true },
  });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, owner.ownerId);
  const input = parsed.data;
  return withIdempotency(req, member, `/review-outreaches/${params.outreachId}/draft`, input, async (tx) => {
    const outreach = await tx.outreach.findUniqueOrThrow({
      where: { id: params.outreachId },
      include: {
        candidate: true,
        recipientContact: true,
        recipientEndpoint: true,
        sentMessages: { select: { id: true }, take: 1 },
      },
    });
    if (outreach.version !== input.expectedVersion || outreach.currentRevision !== input.expectedRevision)
      throw new ApiError("VERSION_CONFLICT", "메시지가 변경됐습니다. 다시 조회하세요.");
    if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
      throw new ApiError("STATE_CONFLICT", "발송 완료된 메시지는 수정할 수 없습니다.");
    const previous = await tx.messageDraftRevision.findUnique({
      where: { outreachId_revision: { outreachId: outreach.id, revision: input.expectedRevision } },
    });
    if (!previous || !outreach.recipientContact || !outreach.recipientEndpoint ||
        outreach.candidate?.reviewStatus !== "approved")
      throw new ApiError("STATE_CONFLICT", "수정할 현재 초안 또는 승인이 없습니다.");
    const matches =
      previous.generationResearchId === outreach.candidate.currentResearchId &&
      previous.generationReviewDecisionId === outreach.candidate.activeReviewDecisionId &&
      previous.recipientContactId === outreach.recipientContactId &&
      previous.recipientEndpointId === outreach.recipientEndpointId &&
      previous.targetQuarterId === outreach.currentTargetQuarterId &&
      (previous.contactPurposeSnapshot ?? null) === (outreach.contactPurpose ?? null);
    const currentRecipient = {
      contactId: outreach.recipientContact.id,
      endpointId: outreach.recipientEndpoint.id,
      name: outreach.recipientContact.name,
      title: outreach.recipientContact.title,
      channel: outreach.recipientEndpoint.channel,
      address: outreach.recipientEndpoint.address,
    };
    if (!matches && (
      input.contextResearchId !== outreach.candidate.currentResearchId ||
      input.contextReviewDecisionId !== outreach.candidate.activeReviewDecisionId ||
      input.contextTargetQuarterId !== outreach.currentTargetQuarterId ||
      JSON.stringify(input.contextRecipient) !== JSON.stringify(currentRecipient)
    )) throw new ApiError("DRAFT_CONTEXT_CHANGED", "조사·수신자·분기 변경 내용을 확인한 뒤 수정하세요.");

    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: { currentRevision: input.expectedRevision + 1, version: { increment: 1 } },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "메시지가 변경됐습니다. 다시 조회하세요.");
    await tx.messageDraftRevision.create({
      data: {
        outreachId: outreach.id,
        revision: input.expectedRevision + 1,
        topic: input.topic,
        subject: input.subject,
        body: input.body,
        templateId: previous.templateId,
        templateVersion: previous.templateVersion,
        createdBy: "admin_edit",
        generationResearchId: matches ? previous.generationResearchId : outreach.candidate.currentResearchId,
        generationReviewDecisionId: matches ? previous.generationReviewDecisionId : outreach.candidate.activeReviewDecisionId,
        recipientContactId: matches ? previous.recipientContactId : outreach.recipientContactId,
        recipientEndpointId: matches ? previous.recipientEndpointId : outreach.recipientEndpointId,
        recipientSnapshot: matches ? (previous.recipientSnapshot ?? undefined) : currentRecipient,
        targetQuarterId: matches ? previous.targetQuarterId : outreach.currentTargetQuarterId,
        contactPurposeSnapshot: matches ? previous.contactPurposeSnapshot : outreach.contactPurpose,
        historySourceIds: previous.historySourceIds ?? undefined,
      },
    });
    return { status: 200, body: { data: await getHumanOutreachDetail(tx, outreach.id) } };
  });
});
