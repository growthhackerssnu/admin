import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead, requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getReviewCandidateDetail } from "@/dh/lib/humanReview/detail";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { notifyWorker } from "@/dh/inngest/client";
import { prisma } from "@/lib/prisma";

const retryInput = z.object({ expectedRevision: z.number().int().positive() }).strict();

export const POST = withListupApiHandler<{ candidateId: string }>(async (req, { member, params }) => {
  const parsed = retryInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "재시도 요청이 올바르지 않습니다.");
  const current = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { reviewOwnerId: true, originCollectedCompanyId: true },
  });
  if (!current?.originCollectedCompanyId) throw new ApiError("NOT_FOUND", "검토 후보를 찾지 못했습니다.");
  if (current.reviewOwnerId) requireReviewOwner(member, current.reviewOwnerId);
  else requireExternalLead(member);

  const result = await withIdempotency(req, member, `/review-candidates/${params.candidateId}/research-retries`, parsed.data, async (tx) => {
    const candidate = await tx.candidate.findUniqueOrThrow({ where: { id: params.candidateId } });
    const latestFailed = await tx.researchTask.findFirst({
      where: {
        candidateId: candidate.id,
        type: "company_research",
        pipeline: "human_review",
        status: "failed",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (
      candidate.researchStatus !== "error" || !latestFailed?.errorRetryable ||
      !candidate.originSearchRunId
    ) throw new ApiError("STATE_CONFLICT", "재시도 가능한 조사 오류가 없습니다.");
    const changed = await tx.candidate.updateMany({
      where: { id: candidate.id, revision: parsed.data.expectedRevision, researchStatus: "error" },
      data: { researchStatus: "queued", revision: { increment: 1 } },
    });
    if (!changed.count) throw new ApiError("REVISION_CONFLICT", "후보가 변경됐습니다. 다시 조회하세요.");
    const task = await tx.researchTask.create({
      data: {
        searchRunId: candidate.originSearchRunId,
        candidateId: candidate.id,
        parentTaskId: latestFailed.id,
        type: "company_research",
        pipeline: "human_review",
        trigger: "retry",
        requestedInformation: [],
        status: "queued",
      },
    });
    return {
      status: 202,
      body: {
        data: {
          candidate: await getReviewCandidateDetail(tx, candidate.id, member.id),
          taskId: task.id,
        },
      },
    };
  });
  await notifyWorker(result.body.data.taskId);
  return result;
});
