import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertRevisionMatch } from "@/lib/revision";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { approveDraftSchema } from "@/lib/validation/outreach";

// POST /drafts/{outreachId}/approval — 지금 리비전을 승인하고 발송 준비 단계로.
export const POST = withApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = approveDraftSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { expectedVersion, expectedRevision } = parsed.data;

  return withIdempotency(req, member, "POST /drafts/:outreachId/approval", parsed.data, async (tx) => {
    const current = await tx.outreach.findUnique({ where: { id: params.outreachId } });
    assertRevisionMatch(current, current?.version, expectedVersion);

    if (current.currentRevision !== expectedRevision) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 초안을 수정했습니다. 최신 내용을 다시 확인해주세요.");
    }
    if (current.workStage !== "draft_review") {
      throw new ApiError("INVALID_STATE", "지금은 초안을 승인할 수 있는 단계가 아닙니다.");
    }

    const updateResult = await tx.outreach.updateMany({
      where: { id: params.outreachId, version: expectedVersion },
      data: {
        approvedRevision: expectedRevision,
        workStage: "ready_to_send",
        version: { increment: 1 },
      },
    });
    if (updateResult.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    return { status: 200, body: successBody(await serializeOutreachDetail(params.outreachId, tx)) };
  });
});
