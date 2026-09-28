import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { getPeopleList } from "@/lib/peopleCache";

// GET /api/v1/people — 디렉토리(/hr) 화면의 목록·검색·필터가 전부 이 응답
// 하나로 처리된다(ARCHITECTURE.md §12.2). 검색어나 필터 값을 쿼리 파라미터로
// 안 받는 이유: 281명 규모에선 서버가 필터링해줄 필요가 없고, 프런트가 전체를
// 한 번 받아서 메모리에서 걸러내는 쪽이 훨씬 단순하다(DB_SCHEMA_HR.md §2.1).
export const GET = withApiHandler(async (_req, { requestId }) => {
  const people = await getPeopleList();
  return { body: successBody({ people }, requestId) };
});
