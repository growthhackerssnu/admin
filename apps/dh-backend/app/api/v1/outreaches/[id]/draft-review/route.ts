import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertRevisionMatch } from "@/lib/revision";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { draftReviewSchema } from "@/lib/validation/outreach";

// POST /outreaches/{id}/draft-review — 기존 초안을 그대로 둔 채 (발송 준비 등
// 다른 단계에서) 초안 검토 단계로 되돌아간다. AI 재생성 호출은 하지 않는다.
export const POST = withApiHandler<{ id: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = draftReviewSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { expectedVersion, draftId } = parsed.data;

  if (draftId !== params.id) {
    throw new ApiError("VALIDATION_ERROR", "draft_id가 이 컨택 건과 일치하지 않습니다.");
  }

  return withIdempotency(req, member, "POST /outreaches/:id/draft-review", parsed.data, async (tx) => {
    const current = await tx.outreach.findUnique({ where: { id: params.id } });
    assertRevisionMatch(current, current?.version, expectedVersion);
    if (!current.currentRevision) {
      throw new ApiError("INVALID_STATE", "아직 초안이 없습니다.");
    }

    const updateResult = await tx.outreach.updateMany({
      where: { id: params.id, version: expectedVersion },
      data: { workStage: "draft_review", approvedRevision: null, version: { increment: 1 } },
    });
    if (updateResult.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    return { status: 200, body: successBody(await serializeOutreachDetail(params.id, tx)) };
  });
});
