import { withApiHandler } from "@/dh/lib/apiHandler";
import { listBody } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /members?active&team
// 담당자 선택용 짧은 목록이라 페이지네이션하지 않는다 — page는 형식을 맞추기 위해 싣는다.
// team=external이면 지금 대외협력 팀장·팀원인 활동 회원만 준다(담당자 필터용).
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") !== "false";
  const externalTeam = searchParams.get("team") === "external";

  const members = await prisma.member.findMany({
    where: externalTeam
      ? { active: true, opsRoles: { some: { opsRole: { in: ["external_lead", "external_member"] } } } }
      : activeOnly ? { active: true } : {},
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return {
    body: listBody(
      members.map((m) => ({ id: m.id, displayName: m.displayName })),
      null,
    ),
  };
});
