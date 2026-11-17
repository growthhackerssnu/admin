import type { Member, Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";
import { roundInclude, serializeRound } from "@/dh/lib/rounds";
import { buildCurrentWork } from "@/dh/lib/humanReview/currentWork";
import { draftContextMismatch, loadOutreachContext } from "@/dh/lib/humanReview/context";
import { templateKindOf } from "@/dh/lib/humanReview/messageTemplate";
import { suggestedTemplateId } from "@/dh/lib/humanReview/messageTemplateStore";

export async function getHumanOutreachDetail(tx: Prisma.TransactionClient, outreachId: string, member: Member) {
  const row = await tx.outreach.findUnique({
    where: { id: outreachId },
    include: {
      owner: { select: { id: true, displayName: true } },
      currentTargetQuarter: { select: { id: true, year: true, quarter: true } },
      acquisitionRound: { include: roundInclude },
      recipientContact: { select: { id: true, name: true, title: true } },
      recipientEndpoint: { select: { id: true, channel: true, address: true } },
      candidate: { select: { reviewStatus: true, currentResearchId: true, activeReviewDecisionId: true } },
      draftRevisions: {
        orderBy: { revision: "desc" },
        take: 1,
        include: { messageTemplateVersion: { select: { templateId: true, version: true } } },
      },
      sentMessages: { orderBy: { sentAt: "desc" }, take: 1 },
      // 사람이 마지막으로 기록한 발송 뒤 상태(논의 중·수주·거절)와 그때의 메모.
      outcomeEvents: {
        where: { source: "manual" },
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        take: 1,
        include: { actor: { select: { displayName: true } } },
      },
    },
  });
  if (!row) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  const ctx = await loadOutreachContext(tx, row);
  const draft = row.draftRevisions[0];
  const mismatch = draft ? draftContextMismatch(draft, row, ctx) : [];
  const sent = row.sentMessages[0];
  const templateKind = templateKindOf(row);
  const outcome = row.outcomeEvents[0];
  const sendStatus = row.sendStatus ?? (sent ? "sent" : "before_send");
  return {
    ...buildCurrentWork({ ...row, sendStatus }, member.id, ctx.hasEvidence),
    companyId: row.companyId,
    candidateId: row.candidateId,
    acquisitionRound: row.acquisitionRound ? serializeRound(row.acquisitionRound) : null,
    route: row.route,
    previousOutreachId: row.previousOutreachId,
    contactPurpose: row.contactPurpose,
    // 이 작업이 쓰는 메일 양식의 경우와 기본 양식(설정 > 메일 양식).
    messageTemplate: {
      kind: templateKind,
      suggestedTemplateId: await suggestedTemplateId(tx, templateKind, row.previousOutreachId),
    },
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
    currentRevision: row.currentRevision,
    contextFingerprint: ctx.fingerprint,
    draft: draft ? {
      outreachId: row.id,
      revision: draft.revision,
      topic: draft.topic,
      subject: draft.subject,
      body: draft.body,
      templateId: draft.templateId,
      templateVersion: draft.templateVersion,
      messageTemplateId: draft.messageTemplateVersion?.templateId ?? null,
      messageTemplateVersion: draft.messageTemplateVersion?.version ?? null,
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
      contextFingerprint: ctx.fingerprint,
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
    latestOutcome: outcome ? {
      status: outcome.toStatus,
      note: outcome.note,
      revisitCondition: outcome.revisitCondition,
      recordedAt: outcome.recordedAt.toISOString(),
      recordedBy: outcome.actor?.displayName ?? null,
    } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
