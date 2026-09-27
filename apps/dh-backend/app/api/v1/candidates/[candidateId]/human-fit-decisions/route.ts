import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { listBody, successBody } from "@/lib/listup/errors";
import { withIdempotency } from "@/lib/idempotency";
import {
  serializeCandidate,
  serializeHumanFitDecision,
} from "@/lib/listup/serializers";
import { recomputeCandidateState } from "@/lib/listup/state";
import { applyFitFollowup } from "@/lib/listup/tasks";
import type { ConditionsSnapshot } from "@/config/listupExecution";
import { humanFitDecisionSchema } from "@/lib/listup/validation";
import {
  buildPage,
  parseCursor,
  parseLimit,
  takeWithLookahead,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { assertRevisionMatch } from "@/lib/revision";
import { assertCanModify } from "@/lib/permissions";
import { notifySearchRun, notifyWorker } from "@/inngest/client";

const decidedBySelect = {
  decidedBy: { select: { id: true, displayName: true } },
} as const;

// GET /candidates/{id}/human-fit-decisions — 사람 판단 이력(append-only).
export const GET = withListupApiHandler<{ candidateId: string }>(
  async (req, { params }) => {
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

    const { items, nextCursor, hasMore } = buildPage(rows, limit);
    return {
      body: listBody(items.map(serializeHumanFitDecision), {
        nextCursor,
        hasMore,
      }),
    };
  },
);

// POST /candidates/{id}/human-fit-decisions — 사람의 판단 직접 변경.
//
// 사람 판단이 시스템 판단보다 우선하고, 시스템 재판단을 만들지 않는다. 판단 저장이
// 성공하면 후속 조사가 접수되지 않아도 201이다 — 자동 한도 소진은 오류가 아니라
// followup.reason으로 알린다(명세 §6.4).
export const POST = withListupApiHandler<{ candidateId: string }>(
  async (req, { member, params }) => {
    const body = await req.json().catch(() => null);
    const parsed = humanFitDecisionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
        fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
      });
    }
    const input = parsed.data;

    const result = await withIdempotency(
      req,
      member,
      "POST /candidates/:id/human-fit-decisions",
      input,
      async (tx) => {
        const candidate = await tx.candidate.findUnique({
          where: { id: params.candidateId },
          include: {
            originSearchRun: {
              select: { conditionsSnapshot: true, assignedMemberId: true },
            },
          },
        });
        assertRevisionMatch(
          candidate,
          candidate?.revision,
          input.expectedRevision,
        );
        // 조사 단계의 담당자는 원발견 배치의 담당자다(v0.4 §6.1).
        assertCanModify(member, candidate.originSearchRun.assignedMemberId);

        if (input.basedOnAssessmentId) {
          const assessment = await tx.fitAssessment.findUnique({
            where: { id: input.basedOnAssessmentId },
            select: { candidateId: true },
          });
          if (!assessment || assessment.candidateId !== candidate.id) {
            throw new ApiError(
              "VALIDATION_ERROR",
              "근거로 지정한 판단이 이 후보의 것이 아닙니다.",
              {
                fieldErrors: { basedOnAssessmentId: "이 후보의 판단이 아님" },
              },
            );
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

        const followup = await applyFitFollowup(tx, {
          candidateId: candidate.id,
          searchRunId: candidate.originSearchRunId,
          verdict: input.verdict,
          usableContactCount: candidate.usableContactCount,
          maxContactSearchRounds: (
            candidate.originSearchRun
              .conditionsSnapshot as unknown as ConditionsSnapshot
          ).execution.maxContactSearchRounds,
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
    const data = result.body as {
      data: {
        candidate: { originSearchRunId: string };
        followup: { taskId: string | null };
      };
    };
    const followup = data.data.followup;
    if (followup.taskId) await notifyWorker(followup.taskId);
    await notifySearchRun(data.data.candidate.originSearchRunId);
    return result;
  },
);
