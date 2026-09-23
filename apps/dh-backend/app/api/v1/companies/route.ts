import { Prisma, type Route, type WorkStage } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = new Set(["name", "updatedAt"]);

// #04 GET /companies?cycleId&lane&route&stage&ownerId&query&sort&cursor&limit
//
// "논의 중"(latestResponse.result === discussing) 기업은 목록에서 제외한다
// (05 문서 §3 라우팅 규칙 2). 이 조건은 컬럼이 아니라 파생값이라 DB 쪽 WHERE로
// 못 걸고 조회 후 걸러낸다 — 학회 규모에서는 무리 없지만, 후보가 아주 많아지면
// 05 문서가 제안한 대로 Company에 캐시 컬럼을 추가하는 걸 고려한다.
export const GET = withApiHandler(async (req, { requestId }) => {
  const { searchParams } = new URL(req.url);
  const cycleId = searchParams.get("cycleId");
  const lane = searchParams.get("lane") ?? "all";
  const route = searchParams.get("route") as Route | null;
  const stage = searchParams.get("stage") as WorkStage | null;
  const ownerId = searchParams.get("ownerId");
  const query = searchParams.get("query");
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const cursor = searchParams.get("cursor");

  const laneStages: Record<string, WorkStage[] | undefined> = {
    list: ["company_review", "recipient_selection"],
    message: ["draft_review", "ready_to_send"],
    status: ["response_check"],
    all: undefined,
  };

  const where: Prisma.OutreachWhereInput = {
    ...(cycleId ? { currentCycleId: cycleId } : {}),
    ...(route ? { route } : {}),
    ...(stage ? { workStage: stage } : laneStages[lane] ? { workStage: { in: laneStages[lane] } } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(lane === "status" ? { OR: [{ workStage: "response_check" }, { internalDecision: { not: "active" } }] } : {}),
    ...(query
      ? {
          company: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { product: { contains: query, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  // 커서 이후로 넉넉히 더 가져와서, "논의 중" 제외 후에도 페이지가 덜 채워지는
  // 흔한 경우를 줄인다. 완전히 정확한 커서 페이지네이션은 아니다(알려진 트레이드오프).
  const rows = await prisma.outreach.findMany({
    where,
    take: limit * 2 + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: SORTABLE_FIELDS.has(searchParams.get("sort") ?? "")
      ? { [searchParams.get("sort") as string]: "asc" }
      : { updatedAt: "desc" },
    include: {
      company: true,
      owner: { select: { id: true, displayName: true } },
      responses: { orderBy: { checkedAt: "desc" }, take: 1 },
      sentMessages: { orderBy: { sentAt: "desc" }, take: 1 },
    },
  });

  const visible = rows.filter((o) => o.responses[0]?.result !== "discussing");
  const page = visible.slice(0, limit);
  const nextCursor = visible.length > limit ? page[page.length - 1]!.id : null;

  return {
    body: successBody(
      {
        items: page.map((o) => ({
          companyId: o.companyId,
          outreachId: o.id,
          name: o.company.name,
          product: o.company.product,
          domain: o.company.domain,
          route: o.route,
          workStage: o.workStage,
          responseStatus: o.responses[0]?.result ?? "unchecked",
          lastSentAt: o.sentMessages[0]?.sentAt.toISOString() ?? null,
          lastSentCycleId: o.lastSentCycleId,
          owner: o.owner,
        })),
        nextCursor,
      },
      requestId,
    ),
  };
});
