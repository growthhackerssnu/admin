import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, listBody, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { serializeTargetQuarter } from "@/lib/serializers/targetQuarter";
import { createTargetQuarterSchema } from "@/lib/validation/targetQuarter";

// GET /target-quarters?limit=&cursor=  — 최근 분기부터(v0.4 §6.4)
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);

  const rows = await prisma.targetQuarter.findMany({
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });

  const { items, nextCursor } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeTargetQuarter), nextCursor) };
});

// POST /target-quarters — 분기 추가. 탐색이나 Cycle을 자동 생성하지 않는다.
export const POST = withApiHandler(async (req, { member }) => {
  const body = await req.json().catch(() => null);
  const parsed = createTargetQuarterSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
      fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
    });
  }
  const { year, quarter } = parsed.data;

  return withIdempotency(req, member, "POST /target-quarters", parsed.data, async (tx) => {
    const existing = await tx.targetQuarter.findUnique({
      where: { year_quarter: { year, quarter } },
    });
    if (existing) {
      // 이미 있으면 기존 ID를 알려주고 화면이 그걸 쓰게 한다(v0.4 §6.4).
      throw new ApiError("ALREADY_EXISTS", "이미 있는 목표 분기입니다.", {
        fieldErrors: { existingId: existing.id },
      });
    }

    const created = await tx.targetQuarter.create({ data: { year, quarter } });
    return { status: 201, body: successBody(serializeTargetQuarter(created)) };
  });
});
