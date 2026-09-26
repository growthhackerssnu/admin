import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { serializeSearchRun } from "@/lib/listup/serializers";
import { prisma } from "@/lib/prisma";

const TERMINAL = ["completed", "partially_completed", "failed"] as const;

// POST /search-runs/{id}/cancel — 본문 없음.
// 본래 멱등한 동작이라 Idempotency-Key를 요구하지 않는다. 이미 취소된 탐색에 다시
// 보내면 같은 상태를 그대로 돌려준다.
//
// 대기 중인 작업만 취소로 바꾼다. 실행 중인 작업은 여기서 멈출 수단이 없어서(워커가
// 아직 없다) 탐색 상태만 남기고, 워커가 생기면 단계 사이에서 이 상태를 확인하게 한다.
export const POST = withApiHandler<{ searchRunId: string }>(async (_req, { params }) => {
  const run = await prisma.searchRun.findUnique({ where: { id: params.searchRunId } });
  if (!run) throw new ApiError("NOT_FOUND", "탐색을 찾을 수 없습니다.");

  if ((TERMINAL as readonly string[]).includes(run.status)) {
    throw new ApiError("INVALID_STATE", "이미 종료된 탐색은 취소할 수 없습니다.", { status: run.status });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (run.status !== "cancelled") {
      await tx.researchTask.updateMany({
        where: { searchRunId: run.id, status: "queued" },
        data: { status: "cancelled", finishedAt: new Date() },
      });
      await tx.searchRun.update({
        where: { id: run.id },
        data: { status: "cancelled", finishedAt: run.finishedAt ?? new Date() },
      });
    }
    return tx.searchRun.findUniqueOrThrow({
      where: { id: run.id },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        quarter: { select: { id: true, label: true } },
      },
    });
  });

  return { status: 202, body: successBody(serializeSearchRun(updated)) };
});
