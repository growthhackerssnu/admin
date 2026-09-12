import { prisma } from "../../lib/prisma";
import { discoverContacts } from "./discoverContacts";

/**
 * 특정 RunCompany에 대해 담당자를 발굴하고, ResearchAttempt/Contact/ContactCandidate/
 * ContactMethod/Evidence로 근거까지 남기며 저장한다.
 */
export async function researchAndPersistContacts(runCompanyId: string): Promise<{ candidateCount: number }> {
  const runCompany = await prisma.runCompany.findUniqueOrThrow({
    where: { id: runCompanyId },
    include: { company: true },
  });

  const previousAttempts = await prisma.researchAttempt.count({
    where: { runCompanyId, stage: "CONTACT_DISCOVERY" },
  });

  const attempt = await prisma.researchAttempt.create({
    data: {
      runCompanyId,
      stage: "CONTACT_DISCOVERY",
      attemptNo: previousAttempts + 1,
      searchStrategy: "web_search: LinkedIn 스니펫 + 회사 홈페이지/보도자료 상호검증",
      status: "RUNNING",
    },
  });

  const discovered = await discoverContacts({
    companyName: runCompany.company.name,
    domain: runCompany.company.domain,
    industry: runCompany.company.industry,
  });

  for (const found of discovered) {
    const contact = await prisma.contact.create({
      data: {
        companyId: runCompany.companyId,
        name: found.name,
        jobTitle: found.jobTitle,
        profileUrl: found.profileUrl,
        checkedAt: new Date(),
      },
    });

    const candidate = await prisma.contactCandidate.create({
      data: {
        researchAttemptId: attempt.id,
        contactId: contact.id,
        roleType: found.roleType,
        roleFitScore: found.roleFitScore,
        contactabilityScore: found.contactabilityScore,
        recommendationReason: found.recommendationReason,
        status: "PROPOSED",
      },
    });

    for (const method of found.contactMethods) {
      await prisma.contactMethod.create({
        data: {
          contactId: contact.id,
          type: method.type,
          value: method.value,
          confidence: method.confidence,
          sourceUrl: method.sourceUrl,
        },
      });
    }

    for (const ev of found.evidence) {
      await prisma.evidence.create({
        data: {
          researchAttemptId: attempt.id,
          subjectType: "CONTACT",
          subjectId: contact.id,
          factKey: ev.factKey,
          factValue: ev.factValue,
          sourceUrl: ev.sourceUrl,
          confidence: ev.confidence,
        },
      });
    }

    void candidate;
  }

  await prisma.researchAttempt.update({
    where: { id: attempt.id },
    data: { status: "SUCCEEDED" },
  });

  return { candidateCount: discovered.length };
}
