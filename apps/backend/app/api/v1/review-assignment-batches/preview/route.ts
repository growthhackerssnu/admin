import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead } from "@/dh/lib/humanReview/access";
import { assignmentInput, assignmentPreview } from "@/dh/lib/humanReview/assignment";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

export const POST = withListupApiHandler(async (req, { member }) => {
  requireExternalLead(member);
  const parsed = assignmentInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "배정 미리보기 입력이 올바르지 않습니다.");
  const preview = await assignmentPreview(prisma, parsed.data);
  return { body: { data: preview } };
});
