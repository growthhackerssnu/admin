import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertVersionMatch } from "@/lib/optimisticLock";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { recipientReviewSchema } from "@/lib/validation/outreach";

// #21 POST /outreaches/{id}/recipient-review — 기존 초안은 유지한 채 수신자
// 재검토 단계로 되돌아간다(AI 재생성 호출 없음). 승인 상태는 해제된다.
export const POST = withApiHandler<{ id: string }>(async (req, { member, params, requestId }) => {
  const body = await req.json().catch(() => null);
  const parsed = recipientReviewSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { expectedVersion } = parsed.data;

  const result = await withIdempotency(req, member, "POST /outreaches/:id/recipient-review", parsed.data, async (tx) => {
    const current = await tx.outreach.findUnique({ where: { id: params.id } });
    assertVersionMatch(current, expectedVersion);

    const updateResult = await tx.outreach.updateMany({
      where: { id: params.id, version: expectedVersion },
      data: { workStage: "recipient_selection", approvedRevision: null, version: { increment: 1 } },
    });
    if (updateResult.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    return { status: 200, body: successBody(await serializeOutreachDetail(params.id, tx), requestId) };
  });

  return result;
});
