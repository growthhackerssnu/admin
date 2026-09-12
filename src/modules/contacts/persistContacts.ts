import { prisma } from "../../lib/prisma";
import { discoverContacts } from "./discoverContacts";

/**
 * 특정 RunCompany에 대해 담당자를 발굴하고, ResearchAttempt/Contact/ContactCandidate/
 * ContactMethod/Evidence로 근거까지 남기며 저장한다.
 *
 * 이 함수는 Inngest step.run 안에서 통째로 호출된다(web_search가 여러 번 걸리는 Claude
 * 호출 하나가 그 안에 있음). Vercel 함수 실행 시간 제한을 넘겨 타임아웃되면 Inngest가
 * 함수 전체를 처음부터 재시도하므로, 이미 성공한 시도가 있으면 재실행하지 않고 그 결과를
 * 그대로 재사용해야 한다 — 그렇지 않으면 재시도마다 Claude 호출과 DB row가 중복된다.
 */
export async function researchAndPersistContacts(runCompanyId: string): Promise<{ candidateCount: number }> {
  const alreadySucceeded = await prisma.researchAttempt.findFirst({
    where: { runCompanyId, stage: "CONTACT_DISCOVERY", status: "SUCCEEDED" },
    orderBy: { attemptNo: "desc" },
  });
  if (alreadySucceeded) {
    const candidateCount = await prisma.contactCandidate.count({
      where: { researchAttemptId: alreadySucceeded.id },
    });
    return { candidateCount };
  }

  const runCompany = await prisma.runCompany.findUniqueOrThrow({
    where: { id: runCompanyId },
    include: { company: true },
  });

  // 이전 재시도가 중간에 죽어(타임아웃 등) RUNNING 상태로 방치된 시도가 있다면 정리한다.
  await prisma.researchAttempt.updateMany({
    where: { runCompanyId, stage: "CONTACT_DISCOVERY", status: "RUNNING" },
    data: { status: "FAILED" },
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
