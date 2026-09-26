import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { successBody } from "@/lib/listup/errors";
import { withIdempotency } from "@/lib/idempotency";
import { serializeResearchTask } from "@/lib/listup/serializers";
import { enqueueResearchTask } from "@/lib/listup/tasks";
import { researchRequestSchema } from "@/lib/listup/validation";
import { prisma } from "@/lib/prisma";
import { assertCanModify } from "@/lib/permissions";

// POST /candidates/{id}/research-requests — 사람이 요청하는 추가 조사.
//
// 자동 한도를 다 쓴 뒤에도 명시적 요청 1회로 실행할 수 있다. 사실 정보 보완
// (company_research)은 followup_policy=none으로 돌려서 시스템 재판단을 자동으로
// 부르지 않는다 — 사람이 보고 판단하는 것이 이 워크플로의 전제다(명세 §3.11).
export const POST = withListupApiHandler<{ candidateId: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = researchRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
      fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
    });
  }
  const input = parsed.data;

  const result = await withIdempotency(
    req,
    member,
    "POST /candidates/:id/research-requests",
    input,
    async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: params.candidateId },
        include: { originSearchRun: { select: { assignedMemberId: true } } },
      });
      if (!candidate) throw new ApiError("NOT_FOUND", "조사 기록을 찾을 수 없습니다.");
      // 추가 조사도 담당자의 작업이다(P-22, P-23).
      assertCanModify(member, candidate.originSearchRun.assignedMemberId);

      const isContactWork =
        input.type === "contact_research" || input.type === "contact_verification";
      if (isContactWork && candidate.effectiveFit !== "fit") {
        throw new ApiError("FIT_REQUIRED", "적합으로 판단된 후보만 연락 조사를 요청할 수 있습니다.", {
          fieldErrors: { effectiveFit: candidate.effectiveFit ?? "not_assessed" },
        });
      }

      if (input.type === "contact_verification") {
        const existing = await tx.contactOptionAssessment.count({ where: { candidateId: candidate.id } });
        if (existing === 0) {
          throw new ApiError("NO_CONTACT_TO_VERIFY", "검증할 연락 창구가 없습니다.");
        }
      }

      const { task, reused } = await enqueueResearchTask(tx, {
        searchRunId: candidate.originSearchRunId,
        candidateId: candidate.id,
        type: input.type,
        trigger: "userRequest",
        requestedInformation: input.requestedInformation,
        // 연락 계열은 연락 가능성 평가까지 이어서 하고, 사실 보완은 거기서 멈춘다.
        followupPolicy: isContactWork ? "automatic" : "none",
      });

      return {
        status: 202,
        body: successBody({ task: serializeResearchTask(task), reused }),
      };
    },
  );

  const taskId = (result.body as { data: { task: { id: string } } }).data.task.id;
  return { ...result, headers: { Location: `/api/v1/tasks/${taskId}` } };
});
