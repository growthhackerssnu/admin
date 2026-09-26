import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, listBody, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import {
  serializeCandidate,
  serializeHumanFitDecision,
} from "@/lib/listup/serializers";
import { recomputeCandidateState } from "@/lib/listup/state";
import {
  cancelPendingFollowups,
  countAutomaticContactRounds,
  enqueueResearchTask,
} from "@/lib/listup/tasks";
import type { SearchLimits } from "@/lib/listup/types";
import { humanFitDecisionSchema } from "@/lib/listup/validation";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { assertRevisionMatch } from "@/lib/revision";

const decidedBySelect = { decidedBy: { select: { id: true, displayName: true } } } as const;

// GET /candidates/{id}/human-fit-decisions — 사람 판단 이력(append-only).
export const GET = withApiHandler<{ candidateId: string }>(async (req, { params }) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { id: true },
  });
  if (!candidate) throw new ApiError("NOT_FOUND", "후보를 찾을 수 없습니다.");

  const rows = await prisma.humanFitDecision.findMany({
    where: { candidateId: candidate.id },
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: decidedBySelect,
  });

  const { items, nextCursor } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeHumanFitDecision), nextCursor) };
});

// POST /candidates/{id}/human-fit-decisions — 사람의 판단 직접 변경.
//
// 사람 판단이 시스템 판단보다 우선하고, 시스템 재판단을 만들지 않는다. 판단 저장이
// 성공하면 후속 조사가 접수되지 않아도 201이다 — 자동 한도 소진은 오류가 아니라
// followup.reason으로 알린다(명세 §6.4).
export const POST = withApiHandler<{ candidateId: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = humanFitDecisionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
      fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
    });
  }
  const input = parsed.data;

  return withIdempotency(
    req,
    member,
    "POST /candidates/:id/human-fit-decisions",
    input,
    async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: params.candidateId },
        include: { searchRun: { select: { limits: true } } },
      });
      assertRevisionMatch(candidate, candidate?.revision, input.expectedRevision);

      if (input.basedOnAssessmentId) {
        const assessment = await tx.fitAssessment.findUnique({
          where: { id: input.basedOnAssessmentId },
          select: { candidateId: true },
        });
        if (!assessment || assessment.candidateId !== candidate.id) {
          throw new ApiError("VALIDATION_ERROR", "근거로 지정한 판단이 이 후보의 것이 아닙니다.", {
            fieldErrors: { basedOnAssessmentId: "이 후보의 판단이 아님" },
          });
        }
      }

      const decision = await tx.humanFitDecision.create({
        data: {
          candidateId: candidate.id,
          verdict: input.verdict,
          reason: input.reason ?? null,
          interventionNote: input.interventionNote ?? null,
          basedOnAssessmentId: input.basedOnAssessmentId ?? null,
          decidedById: member.id,
        },
        include: decidedBySelect,
      });

      await tx.candidate.update({
        where: { id: candidate.id },
        data: { activeHumanDecisionId: decision.id },
      });

      const followup = await applyFollowup(tx, {
        candidateId: candidate.id,
        searchRunId: candidate.searchRunId,
        verdict: input.verdict,
        usableContactCount: candidate.usableContactCount,
        limits: candidate.searchRun.limits as unknown as SearchLimits,
      });

      const updated = await recomputeCandidateState(tx, candidate.id);

      return {
        status: 201,
        body: successBody({
          decision: serializeHumanFitDecision(decision),
          candidate: serializeCandidate(updated ?? candidate),
          followup,
        }),
      };
    },
  );
});

type FollowupResult = {
  action: "task_created" | "task_reused" | "contacts_reused" | "none";
  taskId: string | null;
  reason:
    | "fit_changed"
    | "existing_task"
    | "existing_contacts"
    | "automatic_limit_reached"
    | "not_fit";
};

// 명세 §4.2의 표를 그대로 구현한다.
async function applyFollowup(
  tx: Parameters<typeof recomputeCandidateState>[0],
  input: {
    candidateId: string;
    searchRunId: string;
    verdict: "fit" | "unfit" | "pending";
    usableContactCount: number;
    limits: SearchLimits;
  },
): Promise<FollowupResult> {
  if (input.verdict !== "fit") {
    await cancelPendingFollowups(tx, input.candidateId);
    return { action: "none", taskId: null, reason: "not_fit" };
  }

  if (input.usableContactCount > 0) {
    return { action: "contacts_reused", taskId: null, reason: "existing_contacts" };
  }

  const activeContactTask = await tx.researchTask.findFirst({
    where: {
      candidateId: input.candidateId,
      type: { in: ["contact_research", "contact_verification"] },
      status: { in: ["queued", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (activeContactTask) {
    return { action: "task_reused", taskId: activeContactTask.id, reason: "existing_task" };
  }

  const usedRounds = await countAutomaticContactRounds(tx, input.candidateId);
  if (usedRounds >= input.limits.maxContactSearchRounds) {
    return { action: "none", taskId: null, reason: "automatic_limit_reached" };
  }

  const { task } = await enqueueResearchTask(tx, {
    searchRunId: input.searchRunId,
    candidateId: input.candidateId,
    type: "contact_research",
    trigger: "fit_changed",
    followupPolicy: "automatic",
  });
  return { action: "task_created", taskId: task.id, reason: "fit_changed" };
}
