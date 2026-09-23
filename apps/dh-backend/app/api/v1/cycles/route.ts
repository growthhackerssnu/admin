import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// #02 GET /cycles?cursor&limit
// 활성 차수는 배열의 마지막 항목이 아니라 endedAt이 null인 행으로 판정한다.
export const GET = withApiHandler(async (req, { requestId }) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const cursor = searchParams.get("cursor");

  const cycles = await prisma.cycle.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { startedAt: "desc" },
    include: { startedBy: { select: { id: true, displayName: true } } },
  });

  const hasMore = cycles.length > limit;
  const page = hasMore ? cycles.slice(0, limit) : cycles;

  const active = await prisma.cycle.findFirst({ where: { endedAt: null }, select: { id: true } });

  return {
    body: successBody(
      {
        items: page.map((c) => ({
          id: c.id,
          name: c.name,
          startedAt: c.startedAt.toISOString(),
          endedAt: c.endedAt?.toISOString() ?? null,
          startedBy: c.startedBy,
        })),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
        activeCycleId: active?.id ?? null,
      },
      requestId,
    ),
  };
});
