import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { findExclusionReason } from "@/lib/contactExclusion";
import { withIdempotency } from "@/lib/idempotency";
import { assertVersionMatch } from "@/lib/revision";
import { assertCanModify } from "@/lib/permissions";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { selectRecipientSchema } from "@/lib/validation/outreach";

// PUT /outreaches/{id}/recipient — 수신자 선택. 프론트가 이미 걸러 보여준
// 후보라도 서버가 다시 제외 대상인지 검증한다.
export const PUT = withApiHandler<{ id: string }>(
  async (req, { member, params }) => {
    const body = await req.json().catch(() => null);
    const parsed = selectRecipientSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
    const { expectedVersion, contactId, endpointId } = parsed.data;

    return withIdempotency(
      req,
      member,
      "PUT /outreaches/:id/recipient",
      parsed.data,
      async (tx) => {
        const current = await tx.outreach.findUnique({
          where: { id: params.id },
        });
        assertVersionMatch(current, current?.version, expectedVersion);
        // 본인 담당 업무만 변경할 수 있다(P-23). 조회는 막지 않는다.
        assertCanModify(member, current.ownerId);

        if (current.workStage !== "recipient_selection") {
          throw new ApiError(
            "INVALID_STATE",
            "지금은 수신자를 선택할 수 있는 단계가 아닙니다.",
          );
        }

        const endpoint = await tx.contactEndpoint.findUnique({
          where: { id: endpointId },
        });
        if (
          !endpoint ||
          endpoint.contactId !== contactId ||
          endpoint.companyId !== current.companyId
        ) {
          throw new ApiError(
            "VALIDATION_ERROR",
            "연락처 정보가 올바르지 않습니다.",
          );
        }

        const exclusionReason = await findExclusionReason({
          outreachId: params.id,
          companyId: current.companyId,
          route: current.route,
          contactId,
        });
        if (exclusionReason) {
          throw new ApiError("CONTACT_EXCLUDED", exclusionReason);
        }

        const updateResult = await tx.outreach.updateMany({
          where: { id: params.id, version: expectedVersion },
          data: {
            recipientContactId: contactId,
            recipientEndpointId: endpointId,
            selectedChannel: endpoint.channel,
            approvedRevision: null,
            version: { increment: 1 },
          },
        });
        if (updateResult.count !== 1) {
          throw new ApiError(
            "VERSION_CONFLICT",
            "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.",
          );
        }

        return {
          status: 200,
          body: successBody(await serializeOutreachDetail(params.id, tx)),
        };
      },
    );
  },
);
