import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { assignableCandidateWhere, requireExternalReader } from "@/dh/lib/humanReview/access";
import { prisma } from "@/lib/prisma";

export const GET = withListupApiHandler(async (_req, { member }) => {
  requireExternalReader(member);
  const [assignable, researching, researchError, assigned, intake] = await Promise.all([
    prisma.candidate.count({ where: assignableCandidateWhere }),
    prisma.candidate.count({ where: { originCollectedCompanyId: { not: null }, researchStatus: { in: ["queued", "running"] } } }),
    prisma.candidate.count({ where: { originCollectedCompanyId: { not: null }, researchStatus: "error" } }),
    prisma.candidate.count({ where: { originCollectedCompanyId: { not: null }, reviewOwnerId: { not: null } } }),
    prisma.collectionIntakeControl.findUnique({ where: { id: "dh" } }),
  ]);
  return {
    body: {
      data: {
        assignable,
        researching,
        researchError,
        assigned,
        intakePaused: intake?.paused ?? false,
        intakeVersion: intake?.version ?? 1,
        canManage: member.role === "admin" || member.opsRole === "external_lead",
        pipelineEnabled: process.env.HUMAN_REVIEW_PIPELINE_ENABLED === "true",
      },
    },
  };
});
