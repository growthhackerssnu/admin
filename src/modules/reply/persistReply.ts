import { prisma } from "../../lib/prisma";
import { classifyAndDraftReply } from "./generateReply";

export async function createReplyDraft(params: {
  contactCandidateId: string;
  incomingText: string;
  createdBy: string;
}): Promise<{ replyDraftId: string; intent: string; draftBody: string } | null> {
  const candidate = await prisma.contactCandidate.findUniqueOrThrow({
    where: { id: params.contactCandidateId },
    include: {
      contact: true,
      researchAttempt: { include: { runCompany: { include: { company: true } } } },
      messageDrafts: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  const latestDraft = candidate.messageDrafts[0];

  const classification = await classifyAndDraftReply({
    companyName: candidate.researchAttempt.runCompany.company.name,
    contactName: candidate.contact.name,
    originalBody: latestDraft?.body ?? null,
    incomingText: params.incomingText,
  });
  if (!classification) return null;

  const reply = await prisma.replyDraft.create({
    data: {
      contactCandidateId: params.contactCandidateId,
      incomingText: params.incomingText,
      classifiedIntent: classification.intent,
      draftBody: classification.draftBody,
      createdBy: params.createdBy,
    },
  });

  return { replyDraftId: reply.id, intent: classification.intent, draftBody: classification.draftBody };
}

/** 답장 초안 모달의 선택지로 쓸, 최근 확정 발송된(메시지 초안이 있는) 담당자 목록. */
export async function listRecentOutreachTargets(limit = 25) {
  const drafts = await prisma.messageDraft.findMany({
    where: { status: "FINALIZED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    distinct: ["contactCandidateId"],
    include: {
      contactCandidate: { include: { contact: true } },
      runCompany: { include: { company: true } },
    },
  });

  return drafts.map((d) => ({
    contactCandidateId: d.contactCandidateId,
    label: `${d.runCompany.company.name} - ${d.contactCandidate.contact.name}`,
  }));
}
