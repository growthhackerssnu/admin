import { z } from "zod";
import { withApiHandler } from "@/hr/lib/apiHandler";
import { ApiError, successBody } from "@/hr/lib/errors";
import { requireReviewer } from "@/hr/lib/auth";
import { approveEditRequest } from "@/hr/lib/editRequestApproval";

const Body = z.object({ reviewNote: z.string().trim().optional() });

// POST /api/v1/admin/edit-requests/:id/approve — 승인은 사유 불필요(§12.4,
// dh의 "진행 결정엔 사유 불필요" 원칙 재사용). 승인되면 실제로 Notion 페이지가
// 바뀐다(§5) — 되돌리려면 다시 수정 요청을 거쳐야 하는 단방향 동작.
export const POST = withApiHandler<{ editRequestId: string }>(async (req, { member, params, requestId }) => {
  requireReviewer(member);
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");

  const editRequest = await approveEditRequest(member, params.editRequestId, parsed.data.reviewNote);
  return { body: successBody(editRequest, requestId) };
});
