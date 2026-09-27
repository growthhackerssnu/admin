import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertVersionMatch } from "@/lib/revision";
import { assertCanModify } from "@/lib/permissions";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { responseCheckSchema } from "@/lib/validation/outreach";

// POST /outreaches/{id}/response-checks — 응답 확인 결과 기록. append-only라
// 여러 번 호출해도 이력이 쌓이고 최신 행이 현재 값이다. 과거 발송 건에 대한
// 기록이라 분기와 무관하게 항상 허용한다.
export const POST = withApiHandler<{ id: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = responseCheckSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
      fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
    });
  }
  const {
    expectedVersion,
    sendId,
    result,
    category,
    note,
    revisitCondition,
  } = parsed.data;

  return withIdempotency(req, member, "POST /outreaches/:id/response-checks", parsed.data, async (tx) => {
    const current = await tx.outreach.findUnique({ where: { id: params.id } });
    assertVersionMatch(current, current?.version, expectedVersion);
    // 본인 담당 업무만 변경할 수 있다(P-23). 조회는 막지 않는다.
    assertCanModify(member, current.ownerId);

    if (sendId) {
      const send = await tx.sentMessage.findUnique({ where: { id: sendId } });
      if (!send || send.outreachId !== params.id) {
        throw new ApiError("VALIDATION_ERROR", "발송 기록이 이 컨택 건과 일치하지 않습니다.");
      }
    }

    await tx.response.create({
      data: {
        outreachId: params.id,
        sentMessageId: sendId ?? null,
        result,
        category,
        explanation: note,
        revisitCondition,
        checkedById: member.id,
      },
    });

    const updateResult = await tx.outreach.updateMany({
      where: { id: params.id, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    if (updateResult.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    return { status: 201, body: successBody(await serializeOutreachDetail(params.id, tx)) };
  });
});
