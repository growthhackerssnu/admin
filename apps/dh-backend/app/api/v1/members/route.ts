import { withApiHandler } from "@/lib/apiHandler";
import { listBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /members?active
// 담당자 선택용 짧은 목록이라 페이지네이션하지 않는다 — page는 형식을 맞추기 위해 싣는다.
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") !== "false";

  const members = await prisma.member.findMany({
    where: activeOnly ? { active: true } : {},
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return {
    body: listBody(
      members.map((m) => ({ id: m.id, display_name: m.displayName })),
      { nextCursor: null, hasMore: false },
    ),
  };
});
