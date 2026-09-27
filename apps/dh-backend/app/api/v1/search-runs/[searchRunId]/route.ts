import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { successBody } from "@/lib/listup/errors";
import { serializeSearchRun } from "@/lib/listup/serializers";
import { prisma } from "@/lib/prisma";

// GET /search-runs/{id} — 조건·상태와 집계.
// 집계는 현재 유효 판단 기준이라, 탐색이 끝난 뒤 사람이 판단을 바꾸면 값도 달라진다.
export const GET = withListupApiHandler<{ searchRunId: string }>(async (_req, { params }) => {
  const run = await prisma.searchRun.findUnique({
    where: { id: params.searchRunId },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      assignedMember: { select: { id: true, displayName: true } },
      targetQuarter: true,
    },
  });
  if (!run) throw new ApiError("NOT_FOUND", "탐색을 찾을 수 없습니다.");

  const [byFit, fitWithContact, noContact, byTaskStatus] = await Promise.all([
    prisma.candidate.groupBy({
      by: ["effectiveFit"],
      where: { originSearchRunId: run.id },
      _count: { _all: true },
    }),
    prisma.candidate.count({
      where: {
        originSearchRunId: run.id,
        effectiveFit: "fit",
        contactResearchStatus: "available",
      },
    }),
    // 적합하지만 쓸 창구를 못 찾은 기업. 조사 내역에는 남고 활성 후보에는 안 들어간다(P-07).
    prisma.candidate.count({
      where: {
        originSearchRunId: run.id,
        effectiveFit: "fit",
        contactResearchStatus: { not: "available" },
      },
    }),
    prisma.researchTask.groupBy({
      by: ["status"],
      where: { searchRunId: run.id },
      _count: { _all: true },
    }),
  ]);

  const fitCount = (verdict: "fit" | "unfit" | "pending" | null) =>
    byFit.find((row) => row.effectiveFit === verdict)?._count._all ?? 0;
  const taskCount = (status: "queued" | "running" | "failed") =>
    byTaskStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    body: successBody({
      searchRun: serializeSearchRun(run),
      // 현재 유효 판단 기준이라 배치가 끝난 뒤 사람이 판단을 바꾸면 값도 바뀐다(v0.4 §6.4).
      counts: {
        candidates: byFit.reduce((sum, row) => sum + row._count._all, 0),
        fit: fitCount("fit"),
        unfit: fitCount("unfit"),
        pending: fitCount("pending"),
        notAssessed: fitCount(null),
        fitWithAvailableContact: fitWithContact,
        noContact,
        eligible: fitWithContact,
        activeTasks: taskCount("queued") + taskCount("running"),
        failedTasks: taskCount("failed"),
      },
    }),
  };
});
