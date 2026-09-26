import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { listBody, successBody } from "@/lib/listup/errors";
import { withIdempotency } from "@/lib/idempotency";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { serializeTargetQuarter } from "@/lib/serializers/targetQuarter";
import { createTargetQuarterSchema } from "@/lib/validation/targetQuarter";

// GET /target-quarters?limit=&cursor=  — 최근 분기부터(v0.4 §6.4)
export const GET = withListupApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);

  const rows = await prisma.targetQuarter.findMany({
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });

  const { items, nextCursor, hasMore } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeTargetQuarter), { nextCursor, hasMore }) };
});

// 담당자 검사 없음: 분기는 특정 팀원의 업무가 아니라 팀 공용 라벨이다. v0.4도 생성
// 주체를 제한하지 않는다.
// POST /target-quarters — 분기 추가. 탐색이나 Cycle을 자동 생성하지 않는다.
export const POST = withListupApiHandler(async (req, { member }) => {
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
