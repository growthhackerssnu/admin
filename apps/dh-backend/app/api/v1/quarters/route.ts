import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, listBody, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { quarterCreatorSelect, serializeQuarter } from "@/lib/serializers/quarter";
import { createQuarterSchema } from "@/lib/validation/quarter";

// GET /quarters?active&cursor&limit
// 전역 "현재 분기"는 없다. 화면이 목록에서 골라 쓴다.
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const activeParam = searchParams.get("active");

  const rows = await prisma.quarter.findMany({
    where: activeParam === null ? {} : { active: activeParam !== "false" },
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { createdBy: quarterCreatorSelect },
  });

  const { items, page } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeQuarter), page) };
});

// POST /quarters — 담당자가 새 분기를 연다.
export const POST = withApiHandler(async (req, { member }) => {
  const body = await req.json().catch(() => null);
  const parsed = createQuarterSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  return withIdempotency(req, member, "POST /quarters", parsed.data, async (tx) => {
    const duplicate = await tx.quarter.findUnique({ where: { label: parsed.data.label } });
    if (duplicate) {
      throw new ApiError("INVALID_STATE", "이미 있는 분기입니다.", { label: parsed.data.label });
    }

    const created = await tx.quarter.create({
      data: { label: parsed.data.label, createdById: member.id },
      include: { createdBy: quarterCreatorSelect },
    });
    return { status: 201, body: successBody(serializeQuarter(created)) };
  });
});
