import { withApiHandler } from "@/dh/lib/apiHandler";
import { ensureCompanyMailboxContacts } from "@/dh/lib/companyMailboxContact";
import { ApiError, fieldErrorsOf, successBody } from "@/dh/lib/errors";
import { withIdempotency } from "@/dh/lib/idempotency";
import { assertCanModify } from "@/dh/lib/permissions";
import { assertRevisionMatch } from "@/dh/lib/revision";
import { serializeOutreachDetail } from "@/dh/lib/serializers/outreach";
import { startOutreachSchema } from "@/dh/lib/validation/outreach";

// POST /candidates/{candidateId}/outreaches — 사람의 명시적 승인으로만
// 탐색 후보를 기존 컨택 업무 흐름에 넘긴다. 수신자·초안·발송은 여기서 하지 않는다.
export const POST = withApiHandler<{ candidateId: string }>(
  async (req, { member, params }) => {
    const body = await req.json().catch(() => null);
    const parsed = startOutreachSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
        fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
      });

    return withIdempotency(
      req,
      member,
      "POST /candidates/:candidateId/outreaches",
      parsed.data,
      async (tx) => {
        const candidate = await tx.candidate.findUnique({
          where: { id: params.candidateId },
          include: {
            company: { select: { id: true, name: true } },
            originSearchRun: {
              select: { assignedMemberId: true, targetQuarterId: true },
            },
          },
        });
        assertRevisionMatch(
          candidate,
          candidate?.revision,
          parsed.data.expectedRevision,
        );
        if (
          !candidate.originSearchRunId ||
          !candidate.originSearchRun?.assignedMemberId ||
          !candidate.originSearchRun.targetQuarterId
        )
          throw new ApiError("NOT_FOUND", "기존 탐색 후보를 찾을 수 없습니다.");
        assertCanModify(member, candidate.originSearchRun.assignedMemberId);

        if (
          candidate.effectiveFit !== "fit" ||
          candidate.usableContactCount < 1
        ) {
          throw new ApiError(
            "FIT_REQUIRED",
            "적합 판정과 사용 가능한 연락처가 확인된 후보만 컨택을 시작할 수 있습니다.",
          );
        }
        const existing = await tx.outreach.findUnique({
          where: { companyId: candidate.companyId },
        });
        if (existing)
          throw new ApiError(
            "ALREADY_EXISTS",
            "이미 컨택 업무가 생성된 기업입니다.",
          );

        await ensureCompanyMailboxContacts(tx, candidate.company);
        const outreach = await tx.outreach.create({
          data: {
            companyId: candidate.companyId,
            ownerId: candidate.originSearchRun.assignedMemberId,
            currentTargetQuarterId: candidate.originSearchRun.targetQuarterId,
            originSearchRunId: candidate.originSearchRunId,
            route: "new",
            workStage: "recipient_selection",
          },
        });
        return {
          status: 201,
          body: successBody(await serializeOutreachDetail(outreach.id, tx)),
        };
      },
    );
  },
);
