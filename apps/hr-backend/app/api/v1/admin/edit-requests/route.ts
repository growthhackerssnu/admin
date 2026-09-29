import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth";
import { getAllEditRequests } from "@/lib/editRequests";

// GET /api/v1/admin/edit-requests — 승인 큐(/hr/admin) 전체 목록. admin만
// 접근 가능(ARCHITECTURE.md §8, 승인 권한은 admin에게만 확정).
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  requireAdmin(member);
  const requests = await getAllEditRequests();
  return { body: successBody({ requests }, requestId) };
});
