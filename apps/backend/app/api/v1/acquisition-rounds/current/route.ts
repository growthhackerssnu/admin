import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { getActiveRound, serializeRound } from "@/dh/lib/rounds";
import { prisma } from "@/lib/prisma";

export const GET = withListupApiHandler(async (_req, { member }) => {
  requireExternalReader(member);
  const round = await getActiveRound(prisma);
  return { body: { data: round ? serializeRound(round) : null } };
});
