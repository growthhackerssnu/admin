import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { ApiError } from "@/dh/lib/errors";
import { notifyWorker } from "@/dh/inngest/client";
import { prisma } from "@/lib/prisma";

// 도메인 자동 제외를 되돌려 검토 목록·배정 대상으로 복원한다. 복원한 후보는 다시 자동 제외되지 않는다.
// 아직 조사 전이면 남아 있던 조사 작업을 바로 깨운다.
export const POST = withListupApiHandler<{ candidateId: string }>(async (_req, { member, params }) => {
  requireExternalReader(member);
  const restored = await prisma.candidate.updateMany({
    where: { id: params.candidateId, autoExcludedAt: { not: null } },
    data: {
      autoExcludedAt: null,
      autoExcludedCategory: null,
      autoExcludedReason: null,
      autoExclusionRestoredAt: new Date(),
      revision: { increment: 1 },
    },
  });
  if (!restored.count) throw new ApiError("STATE_CONFLICT", "자동 제외된 후보가 아닙니다.");
  const queued = await prisma.researchTask.findFirst({
    where: { candidateId: params.candidateId, pipeline: "human_review", type: "company_research", status: "queued" },
    select: { id: true },
  });
  if (queued) await notifyWorker(queued.id);
  return { body: { data: { candidateId: params.candidateId } } };
});
