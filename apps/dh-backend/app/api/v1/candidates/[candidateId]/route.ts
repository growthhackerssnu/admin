import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import {
  serializeCandidate,
  serializeCompanyResearch,
  serializeEvidence,
  serializeFitAssessment,
  serializeHumanFitDecision,
  serializeResearchTask,
} from "@/lib/listup/serializers";
import { prisma } from "@/lib/prisma";
import { serializeCompany } from "@/lib/serializers/company";

// GET /candidates/{id} — 후보 상세.
// 연락처 전체는 /candidates/{id}/contacts에서 따로 가져간다.
export const GET = withApiHandler<{ candidateId: string }>(async (_req, { params }) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    include: {
      company: true,
      currentResearch: { include: { claims: { orderBy: { id: "asc" } } } },
      latestSystemAssessment: { include: { interventions: { orderBy: { id: "asc" } } } },
      activeHumanDecision: { include: { decidedBy: { select: { id: true, displayName: true } } } },
    },
  });
  if (!candidate) throw new ApiError("NOT_FOUND", "후보를 찾을 수 없습니다.");

  // 발견 근거 + 조사 주장 + 개입 평가가 참조하는 근거를 한 번에 모아 온다.
  const evidenceIds = new Set<string>(candidate.discoveryEvidenceIds);
  for (const claim of candidate.currentResearch?.claims ?? []) {
    for (const id of claim.evidenceIds) evidenceIds.add(id);
  }
  for (const intervention of candidate.latestSystemAssessment?.interventions ?? []) {
    for (const id of intervention.possibilityEvidenceIds) evidenceIds.add(id);
    for (const id of intervention.valueEvidenceIds) evidenceIds.add(id);
  }

  const [evidence, activeTasks, latestFailedTask, contactCounts] = await Promise.all([
    evidenceIds.size
      ? prisma.evidence.findMany({
          where: { id: { in: [...evidenceIds] } },
          orderBy: { retrievedAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.researchTask.findMany({
      where: { candidateId: candidate.id, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.researchTask.findFirst({
      where: { candidateId: candidate.id, status: "failed" },
      orderBy: { createdAt: "desc" },
    }),
    Promise.resolve({
      usable: candidate.usableContactCount,
      needsVerification: candidate.needsVerificationContactCount,
      unusable: candidate.unusableContactCount,
    }),
  ]);

  return {
    body: successBody({
      candidate: serializeCandidate(candidate),
      company: serializeCompany(candidate.company),
      currentResearch: candidate.currentResearch
        ? serializeCompanyResearch(candidate.currentResearch)
        : null,
      latestSystemAssessment: candidate.latestSystemAssessment
        ? serializeFitAssessment(candidate.latestSystemAssessment)
        : null,
      activeHumanDecision: candidate.activeHumanDecision
        ? serializeHumanFitDecision(candidate.activeHumanDecision)
        : null,
      evidence: evidence.map(serializeEvidence),
      contactCounts: contactCounts,
      activeTasks: activeTasks.map(serializeResearchTask),
      latestFailedTask: latestFailedTask ? serializeResearchTask(latestFailedTask) : null,
    }),
  };
});
