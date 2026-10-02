import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { prisma } from "@/lib/prisma";

export const GET = withListupApiHandler<{ outreachId: string }>(async (_req, { member, params }) => {
  requireExternalReader(member);
  return { body: { data: await getHumanOutreachDetail(prisma, params.outreachId) } };
});
