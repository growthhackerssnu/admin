import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertVersionMatch } from "@/lib/revision";
import { assertCanModify } from "@/lib/permissions";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { approvalSchema } from "@/lib/validation/outreach";

// POST /outreaches/{id}/approval — 기업 검토 승인 → 수신자 선택 단계로.
// 재접촉 경로는 review_note(재접촉 사유)가 필수, 나머지 경로는 사유 없이 승인.
export const POST = withApiHandler<{ id: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = approvalSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const {
    expectedVersion,
    reviewNote,
    conditionEvidence,
  } = parsed.data;

  return withIdempotency(req, member, "POST /outreaches/:id/approval", parsed.data, async (tx) => {
    const current = await tx.outreach.findUnique({ where: { id: params.id } });
    assertVersionMatch(current, current?.version, expectedVersion);
    // 본인 담당 업무만 변경할 수 있다(P-23). 조회는 막지 않는다.
    assertCanModify(member, current.ownerId);

    if (current.workStage !== "company_review") {
      throw new ApiError("INVALID_STATE", "지금은 승인할 수 있는 단계가 아닙니다.");
    }
    if (current.route === "recontact" && !reviewNote?.trim()) {
      throw new ApiError("VALIDATION_ERROR", "재접촉 승인에는 사유가 필요합니다.", {
        fieldErrors: { reviewNote: "필수" },
      });
    }

    const updateResult = await tx.outreach.updateMany({
      where: { id: params.id, version: expectedVersion },
      data: {
        workStage: "recipient_selection",
        reviewNote,
        conditionEvidence,
        reviewedAt: new Date(),
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
