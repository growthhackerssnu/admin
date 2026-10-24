import { withApiHandler } from "@/hr/lib/apiHandler";
import { ApiError, successBody } from "@/hr/lib/errors";
import { getViewer, getWhitepaperFor } from "@/hr/lib/whitepapers";

// GET /api/v1/whitepapers/:notionPageId — 백서 상세. 본문(blocks)은 canRead일 때만
// 들어있다(alumni는 본인이 참여한 프로젝트만, whitepapers.ts 머리말 참고).
export const GET = withApiHandler<{ notionPageId: string }>(async (_req, { member, params, requestId }) => {
  const whitepaper = await getWhitepaperFor(await getViewer(member), params.notionPageId);
  if (!whitepaper) throw new ApiError("NOT_FOUND", "해당 백서를 찾을 수 없습니다.");
  return { body: successBody(whitepaper, requestId) };
});
