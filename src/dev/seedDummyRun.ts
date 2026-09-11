import { prisma } from "../lib/prisma";

const DUMMY_COMPANIES = [
  {
    name: "테스트스타트업 A",
    domain: "test-startup-a.example.com",
    industry: "핀테크",
    fundingStage: "Series A",
    employeeCount: 15,
    fitScore: 0.82,
    recommendationReason: "핀테크 데이터 분석 프로젝트 수요가 채용공고에서 확인됨",
    uncertainty: null,
  },
  {
    name: "테스트스타트업 B",
    domain: "test-startup-b.example.com",
    industry: "이커머스",
    fundingStage: "Seed",
    employeeCount: 8,
    fitScore: 0.55,
    recommendationReason: "최근 투자 유치 보도자료 확인",
    uncertainty: "임직원수는 링크드인 추정치로 신뢰도 낮음",
  },
] as const;

/**
 * Phase 1 durable-workflow 검증(step.waitForEvent 정지/재개)을 위한 더미 데이터 생성.
 * 실제 소싱 파이프라인이 붙는 Phase 2 이후에는 사용하지 않는다.
 */
export async function seedDummyWorkflowRun(): Promise<{ runId: string }> {
  const config = await prisma.workflowConfig.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "테스트 설정",
      industry: "전체",
      fundingStage: "Seed~Series A",
      headcountMin: 1,
      headcountMax: 50,
      targetCompanyCount: 2,
      companyRetryLimit: 2,
      contactRetryLimit: 2,
    },
  });

  const run = await prisma.workflowRun.create({
    data: {
      configId: config.id,
      criteriaSnapshot: {
        industry: config.industry,
        fundingStage: config.fundingStage,
        headcountMin: config.headcountMin,
        headcountMax: config.headcountMax,
      },
      status: "PENDING",
    },
  });

  for (const dummy of DUMMY_COMPANIES) {
    const company = await prisma.company.upsert({
      where: { domain: dummy.domain },
      update: {},
      create: {
        name: dummy.name,
        domain: dummy.domain,
        industry: dummy.industry,
        fundingStage: dummy.fundingStage,
        employeeCount: dummy.employeeCount,
        checkedAt: new Date(),
      },
    });

    await prisma.runCompany.create({
      data: {
        runId: run.id,
        companyId: company.id,
        fitScore: dummy.fitScore,
        recommendationReason: dummy.recommendationReason,
        uncertainty: dummy.uncertainty,
        status: "CANDIDATE",
      },
    });
  }

  return { runId: run.id };
}
