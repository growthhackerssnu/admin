import { prisma } from "../../lib/prisma";
import { collectRawCandidates } from "./sourceFeeds";
import { evaluateCandidate, type CriteriaSnapshot } from "./evaluateCandidate";
import { checkCooldownGate, normalizeDomain } from "./cooldownGate";

const MAX_RAW_CANDIDATES = 15;

/**
 * Inngest의 step.run과 구조적으로만 호환되면 되는 최소 인터페이스(전체 SDK의 복잡한
 * Jsonify 제네릭에 결합하지 않기 위해 반환 타입은 unknown으로 받고 호출부에서 캐스팅한다).
 * 후보 평가마다 별도 step으로 쪼개는 이유: 최대 15개 후보 x web_search 호출은
 * 순서대로 실행하면 Vercel 서버리스 함수 1회 호출의 실행 시간 제한을 넘길 수 있다.
 * Inngest는 step 하나당 별도의 함수 호출로 처리하므로, 잘게 쪼개면 이 제한을 피할 수 있다.
 */
export interface StepRunner {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>;
}

type PassedCandidate = {
  domain: string;
  name: string;
  industry: string | null;
  fundingStage: string | null;
  employeeCount: number | null;
  fitScore: number;
  recommendationReason: string;
  uncertainty: string | null;
};

/**
 * 실제 소싱 파이프라인: 활성 SourceFeed를 읽어 규칙 기반으로 후보를 추리고,
 * 통과한 후보만 LLM(Claude + web_search)으로 평가한 뒤, 도메인 중복·쿨다운 게이팅을
 * 거쳐 목표 수의 2~3배를 RUN_COMPANY로 등록한다.
 *
 * WorkflowRun 자체는 이미 존재한다고 가정한다(트리거가 만들어둔다) — 이 함수는
 * 그 run에 RunCompany 후보를 채워 넣는 역할만 한다.
 */
export async function runSourcingPipeline(
  runId: string,
  step: StepRunner,
): Promise<{ candidateCount: number }> {
  const run = await prisma.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: { config: true },
  });

  const criteria = run.criteriaSnapshot as unknown as CriteriaSnapshot;
  const targetCount = run.config.targetCompanyCount;
  const maxCandidates = Math.min(MAX_RAW_CANDIDATES, targetCount * 5);

  const rawCandidates = (await step.run("collect-raw-candidates", async () => {
    const feeds = await prisma.sourceFeed.findMany({ where: { active: true } });
    return (await collectRawCandidates(feeds)).slice(0, maxCandidates);
  })) as Awaited<ReturnType<typeof collectRawCandidates>>;

  const passed: PassedCandidate[] = [];

  for (const [i, raw] of rawCandidates.entries()) {
    const result = (await step.run(`evaluate-candidate-${i}`, async () => {
      const evaluation = await evaluateCandidate(raw, criteria);
      if (!evaluation || !evaluation.isCompany || !evaluation.domain) return null;

      const domain = normalizeDomain(evaluation.domain);
      const gate = await checkCooldownGate(domain);
      if (!gate.eligible) return null;

      return { ...evaluation, domain };
    })) as { domain: string; industry: string | null; fundingStage: string | null; employeeCount: number | null; fitScore: number; recommendationReason: string; uncertainty: string | null } | null;
    if (!result) continue;

    // 이번 실행 안에서 같은 도메인이 여러 기사로 중복 등장하면 먼저(=더 최신) 것만 남긴다.
    if (passed.some((p) => p.domain === result.domain)) continue;

    passed.push({
      domain: result.domain,
      name: raw.name,
      industry: result.industry,
      fundingStage: result.fundingStage,
      employeeCount: result.employeeCount,
      fitScore: result.fitScore,
      recommendationReason: result.recommendationReason,
      uncertainty: result.uncertainty,
    });
  }

  const selected = [...passed].sort((a, b) => b.fitScore - a.fitScore).slice(0, targetCount * 3);

  const candidateCount = (await step.run("persist-run-companies", async () => {
    for (const candidate of selected) {
      const company = await prisma.company.upsert({
        where: { domain: candidate.domain },
        update: {
          industry: candidate.industry ?? undefined,
          fundingStage: candidate.fundingStage ?? undefined,
          employeeCount: candidate.employeeCount ?? undefined,
          checkedAt: new Date(),
          status: "ACTIVE",
        },
        create: {
          name: candidate.name,
          domain: candidate.domain,
          industry: candidate.industry,
          fundingStage: candidate.fundingStage,
          employeeCount: candidate.employeeCount,
          checkedAt: new Date(),
          status: "ACTIVE",
        },
      });

      await prisma.runCompany.create({
        data: {
          runId,
          companyId: company.id,
          fitScore: candidate.fitScore,
          recommendationReason: candidate.recommendationReason,
          uncertainty: candidate.uncertainty,
          status: "CANDIDATE",
        },
      });
    }
    return selected.length;
  })) as number;

  return { candidateCount };
}
