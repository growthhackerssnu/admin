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

/**
 * 회사명/담당자명 일부로 발송 확정된 아웃리치 대상을 찾는다. Slack 모달을 trigger_id
 * 만료 없이 즉시 열기 위해, 대상 선택은 모달을 여는 시점이 아니라 제출 시점에 한다.
 */
export async function findOutreachTargetsByQuery(query: string, limit = 5) {
  const drafts = await prisma.messageDraft.findMany({
    where: {
      status: "FINALIZED",
      OR: [
        { runCompany: { company: { name: { contains: query, mode: "insensitive" } } } },
        { contactCandidate: { contact: { name: { contains: query, mode: "insensitive" } } } },
      ],
    },
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
