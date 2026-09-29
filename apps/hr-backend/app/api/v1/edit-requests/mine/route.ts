import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { getMyEditRequests } from "@/lib/editRequests";

// GET /api/v1/edit-requests/mine — 본인이 제출한 edit_requests 전체(상태
// 무관, 최신순). 프로필 상세의 편집 폼 프리필(§12.3)과 내 수정 요청
// 화면(§12.5) 둘 다 이걸 쓴다.
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  const requests = await getMyEditRequests(member);
  return { body: successBody({ requests }, requestId) };
});
