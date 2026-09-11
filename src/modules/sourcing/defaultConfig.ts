import { prisma } from "../../lib/prisma";

// TODO: WorkflowConfig를 여러 개 만들고 선택하는 관리 UI/커맨드가 생기기 전까지 쓰는 고정 기본값.
const DEFAULT_CONFIG_ID = "00000000-0000-0000-0000-000000000002";

export async function ensureDefaultWorkflowConfig() {
  return prisma.workflowConfig.upsert({
    where: { id: DEFAULT_CONFIG_ID },
    update: {},
    create: {
      id: DEFAULT_CONFIG_ID,
      name: "기본 설정",
      industry: "전체",
      fundingStage: "Seed~Series A",
      headcountMin: 1,
      headcountMax: 50,
      targetCompanyCount: 3,
      companyRetryLimit: 2,
      contactRetryLimit: 2,
    },
  });
}
