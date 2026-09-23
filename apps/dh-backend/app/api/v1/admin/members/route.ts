import { withApiHandler } from "@/lib/apiHandler";
import { requireAdmin } from "@/lib/auth";
import { successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /api/v1/admin/members — 회원 명단(admin 전용). #11 GET /members(활성
// 멤버 id+이름만 주는 담당자 필터용 조회)와는 별개 — 여긴 관리 화면용으로
// role·활성여부·가입일·최근 접속일·기수(있으면)까지 전부 내려준다.
export const GET = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);
  const cursor = searchParams.get("cursor");

  const rows = await prisma.member.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: { claimedPersonEntry: { select: { cohort: true } } },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    body: successBody(
      {
        items: page.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          cohort: m.claimedPersonEntry?.cohort ?? null,
          email: m.email,
          role: m.role,
          active: m.active,
          createdAt: m.createdAt.toISOString(),
          lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
        })),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      },
      requestId,
    ),
  };
});
