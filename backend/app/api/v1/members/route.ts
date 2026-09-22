import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// #11 GET /members?active
export const GET = withApiHandler(async (req, { requestId }) => {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") !== "false";

  const members = await prisma.member.findMany({
    where: activeOnly ? { active: true } : {},
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return { body: successBody({ items: members }, requestId) };
});
