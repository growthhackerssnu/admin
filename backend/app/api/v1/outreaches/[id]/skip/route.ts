import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertActiveCycle, assertVersionMatch } from "@/lib/optimisticLock";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { skipSchema } from "@/lib/validation/outreach";

// #17 POST /outreaches/{id}/skip — 이번 차수 건너뛰기. 다음 차수에 company_review로
// 복귀한다(그 복귀 처리는 차수 시작 로직의 몫 — Phase 3). new 경로는 건너뛰기 자체가
// 없고, repeat_collaboration은 건너뛰는 이유가 필수다 (05 문서 §3 경로별 내부 결정).
export const POST = withApiHandler<{ id: string }>(async (req, { member, params, requestId }) => {
  const body = await req.json().catch(() => null);
  const parsed = skipSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { expectedVersion, cycleId, note } = parsed.data;

  const result = await withIdempotency(req, member, "POST /outreaches/:id/skip", parsed.data, async (tx) => {
    const current = await tx.outreach.findUnique({ where: { id: params.id } });
    assertVersionMatch(current, expectedVersion);
    assertActiveCycle(current.currentCycleId, cycleId);

    if (current.route === "new") {
      throw new ApiError("INVALID_STATE", "신규 경로는 건너뛰기를 지원하지 않습니다.");
    }
    if (current.route === "repeat_collaboration" && !note?.trim()) {
      throw new ApiError("VALIDATION_ERROR", "재협업을 진행하지 않는 사유가 필요합니다.", {
        fieldErrors: { note: "필수" },
      });
    }

    const updateResult = await tx.outreach.updateMany({
      where: { id: params.id, version: expectedVersion },
      data: {
        internalDecision: "skipped_for_cycle",
        skipNote: note,
        skipCycleId: cycleId,
        decidedById: member.id,
        decidedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updateResult.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    return { status: 200, body: successBody(await serializeOutreachDetail(params.id, tx), requestId) };
  });

  return result;
});
