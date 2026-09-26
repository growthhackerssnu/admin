import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertVersionMatch } from "@/lib/revision";
import { assertCanModify } from "@/lib/permissions";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { skipSchema } from "@/lib/validation/outreach";

// POST /outreaches/{id}/skip — 이번 분기 건너뛰기. 다음 분기에 company_review로
// 복귀한다. new 경로는 건너뛰기 자체가 없고, repeat_collaboration은 건너뛰는 이유가
// 필수다 (05 문서 §3 경로별 내부 결정).
export const POST = withApiHandler<{ id: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = skipSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { expectedVersion, quarterId, note } = parsed.data;

  return withIdempotency(req, member, "POST /outreaches/:id/skip", parsed.data, async (tx) => {
    const current = await tx.outreach.findUnique({ where: { id: params.id } });
    assertVersionMatch(current, current?.version, expectedVersion);
    // 본인 담당 업무만 변경할 수 있다(P-23). 조회는 막지 않는다.
    assertCanModify(member, current.ownerId);

    // 전역 "현재 분기"가 없으므로, 건너뛸 분기는 이 컨택 건이 실제로 속한 분기여야 한다.
    if (current.currentTargetQuarterId !== quarterId) {
      throw new ApiError("INVALID_STATE", "이 컨택 건의 분기가 아닙니다. 최신 내용을 다시 확인해주세요.", {
        fieldErrors: { quarterId: "이 컨택 건의 분기가 아님" },
        });
    }
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
        internalDecision: "skipped_for_quarter",
        skipNote: note,
        skipQuarterId: quarterId,
        decidedById: member.id,
        decidedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updateResult.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    return { status: 200, body: successBody(await serializeOutreachDetail(params.id, tx)) };
  });
});
