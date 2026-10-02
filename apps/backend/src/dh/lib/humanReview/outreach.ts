import type { Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";

export async function getHumanOutreachDetail(tx: Prisma.TransactionClient, outreachId: string) {
  const row = await tx.outreach.findUnique({
    where: { id: outreachId },
    include: {
      owner: { select: { id: true, displayName: true } },
      currentTargetQuarter: { select: { id: true, year: true, quarter: true } },
      recipientContact: { select: { id: true, name: true, title: true } },
      recipientEndpoint: { select: { id: true, channel: true, address: true } },
      candidate: { select: { currentResearchId: true, activeReviewDecisionId: true } },
      draftRevisions: { orderBy: { revision: "desc" }, take: 1 },
      sentMessages: { orderBy: { sentAt: "desc" }, take: 1 },
    },
  });
  if (!row) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  const draft = row.draftRevisions[0];
  const mismatch: string[] = [];
  if (draft) {
    if (row.candidate?.currentResearchId !== draft.generationResearchId)
      mismatch.push("research_changed");
    if (row.candidate?.activeReviewDecisionId !== draft.generationReviewDecisionId)
      mismatch.push("review_changed");
    if (row.recipientContactId !== draft.recipientContactId ||
        row.recipientEndpointId !== draft.recipientEndpointId)
      mismatch.push("recipient_changed");
    if (row.currentTargetQuarterId !== draft.targetQuarterId)
      mismatch.push("quarter_changed");
    if ((row.contactPurpose ?? null) !== (draft.contactPurposeSnapshot ?? null))
      mismatch.push("purpose_changed");
  }
  const sent = row.sentMessages[0];
  return {
    id: row.id,
    candidateId: row.candidateId,
    companyId: row.companyId,
    contactPurpose: row.contactPurpose,
    owner: { id: row.owner.id, name: row.owner.displayName },
    version: row.version,
    currentTargetQuarter: row.currentTargetQuarter,
    recipient: row.recipientContact && row.recipientEndpoint ? {
      contactId: row.recipientContact.id,
      endpointId: row.recipientEndpoint.id,
      name: row.recipientContact.name,
      title: row.recipientContact.title,
      channel: row.recipientEndpoint.channel,
      address: row.recipientEndpoint.address,
    } : null,
    selectedChannel: row.selectedChannel,
    sendStatus: row.sendStatus ?? (sent ? "sent" : "before_send"),
    currentRevision: row.currentRevision,
    draft: draft ? {
      outreachId: row.id,
      revision: draft.revision,
      topic: draft.topic,
      subject: draft.subject,
      body: draft.body,
      templateId: draft.templateId,
      templateVersion: draft.templateVersion,
      createdBy: draft.createdBy,
      createdAt: draft.createdAt.toISOString(),
      generationResearchId: draft.generationResearchId,
      generationReviewDecisionId: draft.generationReviewDecisionId,
      contactPurposeSnapshot: draft.contactPurposeSnapshot,
      historySourceIds: draft.historySourceIds,
      recipientContactId: draft.recipientContactId,
      recipientEndpointId: draft.recipientEndpointId,
      recipientSnapshot: draft.recipientSnapshot,
      targetQuarterId: draft.targetQuarterId,
      contextMatches: mismatch.length === 0,
      contextMismatchReasons: mismatch,
    } : null,
    latestSend: sent ? {
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
    } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
