import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { serializeResearchTask } from "@/lib/listup/serializers";
import { prisma } from "@/lib/prisma";

// POST /tasks/{id}/retry — 본문 없음. 본래 멱등하므로 Idempotency-Key를 요구하지 않는다.
//
// 재시도는 같은 작업 ID의 attempt를 올리는 것이고, 내용 보완 조사 라운드와는 다른
// 축이다(명세 §3.11). 접수 전에 현재 상황을 다시 확인해서, 그사이 취소된 탐색이나
// 부적합으로 바뀐 후보의 자동 연락 조사는 되살리지 않는다(§6.8).
export const POST = withApiHandler<{ taskId: string }>(async (_req, { params }) => {
  const updated = await prisma.$transaction(async (tx) => {
    const task = await tx.researchTask.findUnique({
      where: { id: params.taskId },
      include: { searchRun: true, candidate: true },
    });
    if (!task) throw new ApiError("NOT_FOUND", "작업을 찾을 수 없습니다.");

    if (task.status !== "failed" || task.errorRetryable !== true) {
      throw new ApiError("TASK_NOT_RETRYABLE", "재시도할 수 있는 상태가 아닙니다.", {
        status: task.status,
        retryable: task.errorRetryable ?? false,
      });
    }
    if (task.searchRun.status === "cancelled") {
      throw new ApiError("TASK_NOT_RETRYABLE", "취소된 탐색의 작업은 재개하지 않습니다.", {
        search_run_status: task.searchRun.status,
      });
    }

    const isAutomaticContactTask =
      task.followupPolicy === "automatic" &&
      (task.type === "contact_research" || task.type === "contact_verification");
    if (isAutomaticContactTask && task.candidate && task.candidate.effectiveFit !== "fit") {
      throw new ApiError("TASK_NOT_RETRYABLE", "적합이 아닌 후보의 자동 연락 조사는 재개하지 않습니다.", {
        effective_fit: task.candidate.effectiveFit ?? "not_assessed",
      });
    }

    return tx.researchTask.update({
      where: { id: task.id },
      data: {
        status: "queued",
        attempt: { increment: 1 },
        errorCode: null,
        errorMessage: null,
        errorRetryable: null,
        startedAt: null,
        finishedAt: null,
      },
    });
  });

  return { status: 202, body: successBody(serializeResearchTask(updated)) };
});
