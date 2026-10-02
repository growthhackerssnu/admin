import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { getReviewCandidateDetail } from "@/dh/lib/humanReview/detail";
import { prisma } from "@/lib/prisma";

export const GET = withListupApiHandler<{ candidateId: string }>(async (_req, { member, params }) => {
  requireExternalReader(member);
  return { body: { data: await getReviewCandidateDetail(prisma, params.candidateId, member.id) } };
});
