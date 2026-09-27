import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { successBody } from "@/lib/listup/errors";
import { serializeResearchTask } from "@/lib/listup/serializers";
import { prisma } from "@/lib/prisma";

// GET /tasks/{id} — 비동기 작업 조회. v0.1은 폴링을 기본으로 한다.
export const GET = withListupApiHandler<{ taskId: string }>(async (_req, { params }) => {
  const task = await prisma.researchTask.findUnique({ where: { id: params.taskId } });
  if (!task) throw new ApiError("NOT_FOUND", "작업을 찾을 수 없습니다.");

  return { body: successBody(serializeResearchTask(task)) };
});
