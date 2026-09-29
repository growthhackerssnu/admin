import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { getFieldOptions } from "@/lib/fieldOptions";

// GET /api/v1/field-options — 프로필 수정 폼의 직무 계열/학과/소속팀
// 드롭다운이 고를 수 있는 값 목록(Notion 실제 select 옵션 그대로).
export const GET = withApiHandler(async (_req, { requestId }) => {
  const options = await getFieldOptions();
  return { body: successBody(options, requestId) };
});
