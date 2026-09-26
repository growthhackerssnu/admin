import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { listBody } from "@/lib/listup/errors";
import { serializeFitAssessment } from "@/lib/listup/serializers";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

// GET /candidates/{id}/fit-assessments — 시스템 판단 이력.
// 판단 지침이 바뀌어도 과거 행과 당시 criteria_version은 그대로 남는다.
export const GET = withListupApiHandler<{ candidateId: string }>(async (req, { params }) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { id: true },
  });
  if (!candidate) throw new ApiError("NOT_FOUND", "후보를 찾을 수 없습니다.");

  const rows = await prisma.fitAssessment.findMany({
    where: { candidateId: candidate.id },
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { interventions: { orderBy: { id: "asc" } } },
  });

  const { items, nextCursor, hasMore } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeFitAssessment), { nextCursor, hasMore }) };
});
