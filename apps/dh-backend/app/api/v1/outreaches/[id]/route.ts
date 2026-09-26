import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";

// GET /outreaches/{id}
export const GET = withApiHandler<{ id: string }>(async (_req, { params }) => {
  const detail = await serializeOutreachDetail(params.id);
  if (!detail) throw new ApiError("NOT_FOUND", "컨택 건을 찾을 수 없습니다.");
  return { body: successBody(detail) };
});
