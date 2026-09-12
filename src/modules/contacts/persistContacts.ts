import { prisma } from "../../lib/prisma";
import { discoverContacts } from "./discoverContacts";

/**
 * 특정 RunCompany에 대해 담당자를 발굴하고, ResearchAttempt/Contact/ContactCandidate/
 * ContactMethod/Evidence로 근거까지 남기며 저장한다.
 *
 * attemptNo는 호출부(outreach-run.ts)가 명시적으로 넘긴다 — "이번 재조사 라운드가
 * 몇 회차인지"와 "Inngest가 같은 스텝을 재시도한 것인지"를 구분해야 하기 때문이다.
 * 이미 이 attemptNo로 성공한 시도가 있으면(Vercel 타임아웃 후 Inngest 재시도) 그
 * 결과를 그대로 재사용하고, 없으면 새 라운드로 진짜 재조사를 수행한다.
 */
export async function researchAndPersistContacts(
  runCompanyId: string,
  attemptNo: number,
): Promise<{ candidateCount: number }> {
  const alreadySucceeded = await prisma.researchAttempt.findFirst({
    where: { runCompanyId, stage: "CONTACT_DISCOVERY", status: "SUCCEEDED", attemptNo },
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

  // 이 라운드가 중간에 죽어(타임아웃 등) RUNNING 상태로 방치된 시도가 있다면 정리한다.
  await prisma.researchAttempt.updateMany({
    where: { runCompanyId, stage: "CONTACT_DISCOVERY", status: "RUNNING", attemptNo },
    data: { status: "FAILED" },
  });

  // 이전 라운드에서 이미 제안했던(그래서 사람이 거절한) 담당자는 다시 추천하지 않도록
  // Claude에게 알려준다.
  const priorCandidates = await prisma.contactCandidate.findMany({
    where: { researchAttempt: { runCompanyId, stage: "CONTACT_DISCOVERY", attemptNo: { lt: attemptNo } } },
    include: { contact: true },
  });
  const excludeNames = [...new Set(priorCandidates.map((c) => c.contact.name))];

  const attempt = await prisma.researchAttempt.create({
    data: {
      runCompanyId,
      stage: "CONTACT_DISCOVERY",
      attemptNo,
      searchStrategy: "web_search: LinkedIn 스니펫 + 회사 홈페이지/보도자료 상호검증",
      status: "RUNNING",
    },
  });

  const discovered = await discoverContacts({
    companyName: runCompany.company.name,
    domain: runCompany.company.domain,
    industry: runCompany.company.industry,
    excludeNames,
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
