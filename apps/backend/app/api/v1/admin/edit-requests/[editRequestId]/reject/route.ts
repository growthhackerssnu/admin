import { z } from "zod";
import { withApiHandler } from "@/hr/lib/apiHandler";
import { ApiError, successBody } from "@/hr/lib/errors";
import { requireReviewer } from "@/hr/lib/auth";
import { rejectEditRequest } from "@/hr/lib/editRequestApproval";

// 반려는 사유 필수(§12.4, dh의 "진행하지 않는 결정엔 사유 필요" 원칙).
const Body = z.object({ reviewNote: z.string().trim().min(1, "반려 사유를 입력하세요.") });

export const POST = withApiHandler<{ editRequestId: string }>(async (req, { member, params, requestId }) => {
  requireReviewer(member);
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "반려 사유를 입력하세요.", {
      fieldErrors: { reviewNote: "반려 사유를 입력하세요." },
    });
  }

  const editRequest = await rejectEditRequest(member, params.editRequestId, parsed.data.reviewNote);
  return { body: successBody(editRequest, requestId) };
});
