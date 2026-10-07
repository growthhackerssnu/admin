import { withApiHandler } from "@/hr/lib/apiHandler";
import { successBody } from "@/hr/lib/errors";
import { requireReviewer } from "@/hr/lib/auth";
import { getAllEditRequests } from "@/hr/lib/editRequests";

// GET /api/v1/admin/edit-requests — 승인 큐(/hr/admin) 전체 목록. admin과
// PR 팀(팀장·팀원)만 접근 가능(src/hr/lib/auth.ts의 canReviewEditRequests).
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  requireReviewer(member);
  const requests = await getAllEditRequests();
  return { body: successBody({ requests }, requestId) };
});
