import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";

// #06 GET /outreaches/{id}
export const GET = withApiHandler<{ id: string }>(async (_req, { params, requestId }) => {
  const detail = await serializeOutreachDetail(params.id);
  if (!detail) throw new ApiError("NOT_FOUND", "컨택 건을 찾을 수 없습니다.");
  return { body: successBody(detail, requestId) };
});
