import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead } from "@/dh/lib/humanReview/access";
import { prisma } from "@/lib/prisma";

export const GET = withListupApiHandler(async (_req, { member }) => {
  requireExternalLead(member);
  const members = await prisma.member.findMany({
    where: { active: true, role: "acting", opsRole: "external_member" },
    select: { id: true, displayName: true },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
  });
  return { body: { data: members.map((row) => ({ id: row.id, name: row.displayName })) } };
});
