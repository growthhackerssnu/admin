import type { Prisma } from "@/generated/prisma";

// 후보의 파생 상태를 다시 계산해 저장하는 유일한 지점이다. 사람 판단 변경, 추가 조사
// 접수, 작업 재시도, (나중에) 워커의 모든 쓰기가 같은 트랜잭션 안에서 이 함수를 부른다.
//
// effective_fit과 contact_status를 저장 컬럼으로 두는 이유: 목록이 두 값을 동시에
// 필터하면서 커서 페이지네이션을 해야 하고, 탐색 상세가 같은 값으로 집계한다.
// 읽기 시점에 계산하면 둘 다 불가능하다.
export async function recomputeCandidateState(tx: Prisma.TransactionClient, candidateId: string) {
  const candidate = await tx.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) return null;

  // 1. effective_fit — 활성 사람 판단 → 최신 시스템 판단 → 미판단(null)
  const activeDecision = candidate.activeHumanDecisionId
    ? await tx.humanFitDecision.findUnique({ where: { id: candidate.activeHumanDecisionId } })
    : null;
  const latestAssessment = candidate.latestSystemAssessmentId
    ? await tx.fitAssessment.findUnique({ where: { id: candidate.latestSystemAssessmentId } })
    : null;
  const effectiveFit = activeDecision?.verdict ?? latestAssessment?.verdict ?? null;

  // 2. 창구 카운터
  const grouped = await tx.candidateContact.groupBy({
    by: ["status"],
    where: { candidateId },
    _count: { _all: true },
  });
  const countOf = (status: "usable" | "needs_verification" | "unusable") =>
    grouped.find((g) => g.status === status)?._count._all ?? 0;
  const usable = countOf("usable");
  const needsVerification = countOf("needs_verification");
  const unusable = countOf("unusable");

  // 3. contact_status — 명세 §4.1의 표를 위에서부터 처음 만족하는 것으로 적용한다.
  const activeContactTask = await tx.researchTask.findFirst({
    where: {
      candidateId,
      type: { in: ["contact_research", "contact_verification"] },
      status: { in: ["queued", "running"] },
    },
    select: { id: true },
  });
  const succeededContactResearch = await tx.researchTask.findFirst({
    where: { candidateId, type: "contact_research", status: "succeeded" },
    select: { id: true },
  });

  let contactStatus: "available" | "searching" | "needs_verification" | "not_found" | "not_started";
  if (usable > 0) contactStatus = "available";
  else if (activeContactTask) contactStatus = "searching";
  else if (needsVerification > 0) contactStatus = "needs_verification";
  else if (succeededContactResearch) contactStatus = "not_found";
  else contactStatus = "not_started";

  // 4. 사용자에게 보이는 상태가 바뀌었을 때만 revision을 올린다.
  const changed =
    candidate.effectiveFit !== effectiveFit ||
    candidate.contactStatus !== contactStatus ||
    candidate.usableContactCount !== usable ||
    candidate.needsVerificationContactCount !== needsVerification ||
    candidate.unusableContactCount !== unusable;

  return tx.candidate.update({
    where: { id: candidateId },
    data: {
      effectiveFit,
      contactStatus,
      usableContactCount: usable,
      needsVerificationContactCount: needsVerification,
      unusableContactCount: unusable,
      ...(changed ? { revision: { increment: 1 } } : {}),
    },
  });
}

// 후보의 현재 판단 출처. 저장하지 않고 두 참조의 null 여부로 유도한다.
export function decisionSourceOf(candidate: {
  activeHumanDecisionId: string | null;
  latestSystemAssessmentId: string | null;
}): "human" | "system" | "none" {
  if (candidate.activeHumanDecisionId) return "human";
  if (candidate.latestSystemAssessmentId) return "system";
  return "none";
}

// GET /candidates?decision_source= 를 where 절로 옮긴다.
export function decisionSourceFilter(
  source: "human" | "system" | "none",
): { activeHumanDecisionId: null | { not: null }; latestSystemAssessmentId?: null | { not: null } } {
  if (source === "human") return { activeHumanDecisionId: { not: null } };
  if (source === "system") return { activeHumanDecisionId: null, latestSystemAssessmentId: { not: null } };
  return { activeHumanDecisionId: null, latestSystemAssessmentId: null };
}
