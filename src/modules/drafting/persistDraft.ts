import { prisma } from "../../lib/prisma";
import { generateDraftSkeleton } from "./generateDraft";
import { getProjectListReference } from "../../lib/notion";

/**
 * 선정된 담당자 1명에 대해 사전조사 요약+문제가설+메시지 초안 스켈레톤을 생성해 저장한다.
 * proposal_input(프로젝트 제안)은 절대 채우지 않고 사람 몫으로 비워둔다.
 *
 * 다른 소싱/발굴 스텝과 같은 이유로(Vercel 함수 타임아웃 후 Inngest 재시도) 이미 만들어진
 * 초안이 있으면 재생성하지 않고 그대로 재사용한다.
 */
export async function createDraftForContactCandidate(
  contactCandidateId: string,
): Promise<{ draftId: string } | null> {
  const existing = await prisma.messageDraft.findFirst({
    where: { contactCandidateId },
    orderBy: { version: "desc" },
  });
  if (existing) return { draftId: existing.id };

  const candidate = await prisma.contactCandidate.findUniqueOrThrow({
    where: { id: contactCandidateId },
    include: {
      contact: true,
      researchAttempt: {
        include: {
          runCompany: { include: { company: true } },
          evidence: true,
        },
      },
    },
  });

  const runCompany = candidate.researchAttempt.runCompany;
  const evidenceFacts = candidate.researchAttempt.evidence
    .filter((e) => e.subjectId === candidate.contactId || e.subjectId === runCompany.companyId)
    .map((e) => `${e.factKey}: ${e.factValue}`);

  const { titles } = await getProjectListReference();

  const skeleton = await generateDraftSkeleton({
    companyName: runCompany.company.name,
    industry: runCompany.company.industry,
    contactName: candidate.contact.name,
    contactJobTitle: candidate.contact.jobTitle,
    evidenceFacts,
    referenceProjectTitles: titles,
  });

  if (!skeleton) return null;

  const draft = await prisma.messageDraft.create({
    data: {
      runCompanyId: runCompany.id,
      contactCandidateId: candidate.id,
      version: 1,
      researchSummary: skeleton.researchSummary,
      problemHypothesis: skeleton.problemHypothesis,
      body: skeleton.body,
      proposalInput: null,
      status: "AWAITING_PROPOSAL",
    },
  });

  return { draftId: draft.id };
}
