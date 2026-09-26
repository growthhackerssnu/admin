import type { ResearchTaskStatus, ResearchTaskType } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, listBody } from "@/lib/errors";
import { serializeResearchTask } from "@/lib/listup/serializers";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const TASK_TYPES: ResearchTaskType[] = [
  "company_discovery",
  "company_research",
  "fit_assessment",
  "contact_research",
  "contact_verification",
];
const TASK_STATUSES: ResearchTaskStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"];

// GET /tasks?search_run_id&candidate_id&type&status&cursor&limit
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const searchRunId = searchParams.get("search_run_id");
  const candidateId = searchParams.get("candidate_id");
  const type = searchParams.get("type");
  const status = searchParams.get("status");

  if (type && !TASK_TYPES.includes(type as ResearchTaskType)) {
    throw new ApiError("INVALID_REQUEST", "type 값이 올바르지 않습니다.", { type });
  }
  if (status && !TASK_STATUSES.includes(status as ResearchTaskStatus)) {
    throw new ApiError("INVALID_REQUEST", "status 값이 올바르지 않습니다.", { status });
  }

  const rows = await prisma.researchTask.findMany({
    where: {
      ...(searchRunId ? { searchRunId } : {}),
      ...(candidateId ? { candidateId } : {}),
      ...(type ? { type: type as ResearchTaskType } : {}),
      ...(status ? { status: status as ResearchTaskStatus } : {}),
    },
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const { items, page } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeResearchTask), page) };
});
