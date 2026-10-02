import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { serializeAssignmentBatch } from "@/dh/lib/humanReview/assignment";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

export const GET = withListupApiHandler<{ batchId: string }>(async (_req, { member, params }) => {
  requireExternalReader(member);
  const batch = await prisma.reviewAssignmentBatch.findUnique({
    where: { id: params.batchId },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      items: { include: { candidate: { select: { reviewStatus: true } } }, orderBy: { assignedAt: "asc" } },
    },
  });
  if (!batch) throw new ApiError("NOT_FOUND", "배정 회차를 찾지 못했습니다.");
  return { body: { data: serializeAssignmentBatch(batch) } };
});
