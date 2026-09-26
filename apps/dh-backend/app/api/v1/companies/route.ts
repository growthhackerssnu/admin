import { Prisma, type Route, type WorkStage } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { listBody } from "@/lib/errors";
import { encodeCursor, parseCursor, parseLimit } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = new Set(["name", "updatedAt"]);

// GET /companies?quarter_id&lane&route&stage&owner_id&query&sort&cursor&limit
//
// 이름과 달리 발송(컨택) 작업 목록이다 — 조회 대상은 outreach다. 발송 기능을
// 재작업할 때 경로 이름도 같이 정리한다.
//
// "논의 중"(latestResponse.result === discussing) 기업은 목록에서 제외한다
// (05 문서 §3 라우팅 규칙 2). 이 조건은 컬럼이 아니라 파생값이라 DB 쪽 WHERE로
// 못 걸고 조회 후 걸러낸다 — 학회 규모에서는 무리 없지만, 후보가 아주 많아지면
// 05 문서가 제안한 대로 Company에 캐시 컬럼을 추가하는 걸 고려한다.
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const quarterId = searchParams.get("quarter_id");
  const lane = searchParams.get("lane") ?? "all";
  const route = searchParams.get("route") as Route | null;
  const stage = searchParams.get("stage") as WorkStage | null;
  const ownerId = searchParams.get("owner_id");
  const query = searchParams.get("query");
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);

  const laneStages: Record<string, WorkStage[] | undefined> = {
    list: ["company_review", "recipient_selection"],
    message: ["draft_review", "ready_to_send"],
    status: ["response_check"],
    all: undefined,
  };

  const where: Prisma.OutreachWhereInput = {
    ...(quarterId ? { quarterId } : {}),
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
  const last = page[page.length - 1];
  const hasMore = visible.length > limit;

  return {
    body: listBody(
      page.map((o) => ({
        company_id: o.companyId,
        outreach_id: o.id,
        name: o.company.name,
        product: o.company.product,
        domain: o.company.domain,
        route: o.route,
        work_stage: o.workStage,
        response_status: o.responses[0]?.result ?? "unchecked",
        last_sent_at: o.sentMessages[0]?.sentAt.toISOString() ?? null,
        last_sent_quarter_id: o.lastSentQuarterId,
        owner: { id: o.owner.id, display_name: o.owner.displayName },
      })),
      { nextCursor: hasMore && last ? encodeCursor(last.id) : null, hasMore },
    ),
  };
});
