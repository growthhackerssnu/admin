import { prisma } from "../../lib/prisma";
import { findForgottenCompanies } from "./findForgottenCompanies";
import { evaluateCandidate, type CriteriaSnapshot } from "../sourcing/evaluateCandidate";
import { ensureDefaultWorkflowConfig } from "../sourcing/defaultConfig";
import type { StepRunner } from "../sourcing/pipeline";

/**
 * 잊혀진 기업 재조사: 쿨다운이 끝난 과거 후보를 다시 web_search로 재평가해(그동안
 * 상황이 바뀌었을 수 있으므로 freshness 재확인 겸함) 여전히 괜찮으면 새 WorkflowRun을
 * 만들어 채워 넣는다. 그 뒤 outreach-run 워크플로우에 그대로 넘기면(runId만 다를 뿐
 * RunCompany가 이미 채워져 있으므로) 소싱 단계는 건너뛰고 승인 카드부터 이어진다 —
 * Phase 2~4에서 만든 파이프라인을 코드 중복 없이 그대로 재사용한다.
 */
export async function runForgottenCompanyRescan(step: StepRunner): Promise<{ runId: string | null; count: number }> {
  const config = (await step.run("ensure-config", () => ensureDefaultWorkflowConfig())) as Awaited<
    ReturnType<typeof ensureDefaultWorkflowConfig>
  >;

  const forgotten = (await step.run("find-forgotten-companies", () => findForgottenCompanies())) as Awaited<
    ReturnType<typeof findForgottenCompanies>
  >;

  if (forgotten.length === 0) {
    return { runId: null, count: 0 };
  }

  const criteria: CriteriaSnapshot = {
    industry: config.industry,
    fundingStage: config.fundingStage,
    headcountMin: config.headcountMin,
    headcountMax: config.headcountMax,
  };

  type Passed = { companyId: string; fitScore: number; recommendationReason: string; uncertainty: string | null };
  const passed: Passed[] = [];

  for (const [i, company] of forgotten.entries()) {
    const result = (await step.run(`reevaluate-${i}`, async () => {
      const evaluation = await evaluateCandidate(
        {
          name: company.name,
          sourceTitle: "재조사: 이전에 검토했던 기업의 최신 상태 재확인",
          sourceUrl: `https://${company.domain}`,
          publishedAt: null,
        },
        criteria,
      );
      if (!evaluation || !evaluation.isCompany || !evaluation.domain) return null;
      return evaluation;
    })) as Awaited<ReturnType<typeof evaluateCandidate>>;

    if (!result) continue;
    passed.push({
      companyId: company.id,
      fitScore: result.fitScore,
      recommendationReason: `[재조사] ${result.recommendationReason}`,
      uncertainty: result.uncertainty,
    });
  }

  if (passed.length === 0) {
    return { runId: null, count: 0 };
  }

  const runId = (await step.run("create-rescan-run", async () => {
    const run = await prisma.workflowRun.create({
      data: {
        configId: config.id,
        criteriaSnapshot: criteria,
        status: "PENDING",
      },
    });

    for (const p of passed) {
      await prisma.runCompany.upsert({
        where: { runId_companyId: { runId: run.id, companyId: p.companyId } },
        update: {},
        create: {
          runId: run.id,
          companyId: p.companyId,
          fitScore: p.fitScore,
          recommendationReason: p.recommendationReason,
          uncertainty: p.uncertainty,
          status: "CANDIDATE",
        },
      });
    }
    return run.id;
  })) as string;

  return { runId, count: passed.length };
}
