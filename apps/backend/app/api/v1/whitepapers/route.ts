import { withApiHandler } from "@/hr/lib/apiHandler";
import { successBody } from "@/hr/lib/errors";
import { getViewer, listWhitepapersFor } from "@/hr/lib/whitepapers";

// GET /api/v1/whitepapers — Projects 앱(/projects) 목록. 디렉토리처럼 전체를 한 번에
// 주고 검색·필터는 프런트가 메모리에서 한다(백서는 수십 건 규모). 항목마다 보는 사람
// 기준의 isMine(참여 여부)·canRead(본문 열람 가능)가 붙는다.
// 경로가 /projects가 아닌 이유: /api/v1/projects는 dh의 프로젝트 API가 쓰고 있다.
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  const whitepapers = await listWhitepapersFor(await getViewer(member));
  return { body: successBody({ whitepapers }, requestId) };
});
