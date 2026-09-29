import { withApiHandler } from "@/portal/lib/apiHandler";
import { requireAdmin } from "@/portal/lib/auth";
import { successBody } from "@/portal/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /api/v1/admin/members — 회원 명단(admin 전용). 관리 화면용으로
// role·운영팀 직책·활성여부·가입일·최근 접속일·기수(있으면)까지 전부 내려준다.
//
// opsRole은 acting에게만 값이 있다. acting인데 null인 행은 ops_role 컬럼이
// 생기기 전에 등록된 회원이다 — 화면에서 "미지정"으로 보이고, 관리자가 직책을
// 지정해주면 채워진다.
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
          opsRole: m.opsRole,
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
