import { withApiHandler } from "@/hr/lib/apiHandler";
import { ApiError, successBody } from "@/hr/lib/errors";
import { getPersonDetail } from "@/hr/lib/peopleCache";

// GET /api/v1/people/:notionPageId — 프로필 상세 화면(/hr/people/:id) 조회
// 모드가 쓴다(ARCHITECTURE.md §12.3). 본인 여부·수정 가능 여부 판단은
// 프런트가 이 응답의 notionPageId를 GET /api/v1/people/me의 notionPageId와 비교해서
// 하고, 여기선 권한 체크를 하지 않는다 — 로그인한 사람이면 누구나 서로의
// 프로필을 볼 수 있는 디렉토리이기 때문(PRD §6.2).
export const GET = withApiHandler<{ notionPageId: string }>(async (_req, { params, requestId }) => {
  const person = await getPersonDetail(params.notionPageId);
  if (!person) throw new ApiError("NOT_FOUND", "해당 알럼나이를 찾을 수 없습니다.");
  return { body: successBody(person, requestId) };
});
