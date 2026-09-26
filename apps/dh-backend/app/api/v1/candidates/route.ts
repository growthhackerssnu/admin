import type { ContactStatus, FitVerdict, Prisma, ResearchTask } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, listBody } from "@/lib/errors";
import { decisionSourceFilter, decisionSourceOf } from "@/lib/listup/state";
import { serializeEffectiveFit, serializeResearchTask } from "@/lib/listup/serializers";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { serializeCompany } from "@/lib/serializers/company";

const FIT_FILTERS = ["fit", "unfit", "pending", "not_assessed"] as const;
const CONTACT_STATUSES: ContactStatus[] = [
  "not_started",
  "searching",
  "available",
  "needs_verification",
  "not_found",
];
const DECISION_SOURCES = ["system", "human", "none"] as const;

// GET /candidates — 결과 화면의 주 목록. 필터는 전부 AND로 적용한다.
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const searchRunId = searchParams.get("searchRunId");
  const companyId = searchParams.get("companyId");
  const effectiveFit = searchParams.get("effectiveFit");
  const contactStatus = searchParams.get("contactStatus");
  const decisionSource = searchParams.get("decisionSource");
  const q = searchParams.get("q");
  const sort = searchParams.get("sort") ?? "created_at_desc";

  if (effectiveFit && !(FIT_FILTERS as readonly string[]).includes(effectiveFit)) {
    throw new ApiError("VALIDATION_ERROR", "effective_fit 값이 올바르지 않습니다.", { fieldErrors: { effectiveFit: "허용되지 않는 값" } });
  }
  if (contactStatus && !CONTACT_STATUSES.includes(contactStatus as ContactStatus)) {
    throw new ApiError("VALIDATION_ERROR", "contact_status 값이 올바르지 않습니다.", { fieldErrors: { contactStatus: "허용되지 않는 값" } });
  }
  if (decisionSource && !(DECISION_SOURCES as readonly string[]).includes(decisionSource)) {
    throw new ApiError("VALIDATION_ERROR", "decision_source 값이 올바르지 않습니다.", { fieldErrors: { decisionSource: "허용되지 않는 값" } });
  }
  if (sort !== "created_at_desc" && sort !== "updated_at_desc") {
    throw new ApiError("VALIDATION_ERROR", "sort 값이 올바르지 않습니다.", { fieldErrors: { sort: "허용되지 않는 값" } });
  }

  const where: Prisma.CandidateWhereInput = {
    ...(searchRunId ? { searchRunId } : {}),
    ...(companyId ? { companyId } : {}),
    // not_assessed는 저장 컬럼의 null이다.
    ...(effectiveFit
      ? { effectiveFit: effectiveFit === "not_assessed" ? null : (effectiveFit as FitVerdict) }
      : {}),
    ...(contactStatus ? { contactStatus: contactStatus as ContactStatus } : {}),
    ...(decisionSource ? decisionSourceFilter(decisionSource as "system" | "human" | "none") : {}),
    ...(q
      ? { company: { OR: [{ name: { contains: q, mode: "insensitive" } }, { aliases: { has: q } }] } }
      : {}),
  };

  const rows = await prisma.candidate.findMany({
    where,
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy:
      sort === "updated_at_desc"
        ? [{ updatedAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      company: true,
      latestSystemAssessment: { select: { verdict: true, summary: true } },
      activeHumanDecision: { select: { verdict: true, reason: true } },
    },
  });

  const { items, nextCursor } = buildPage(rows, limit);
  const candidateIds = items.map((c) => c.id);

  // 후보마다 따로 조회하지 않고 두 번에 나눠 가져와 N+1을 피한다.
  const [activeTasks, failedTasks] = await Promise.all([
    candidateIds.length
      ? prisma.researchTask.findMany({
          where: { candidateId: { in: candidateIds }, status: { in: ["queued", "running"] } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([] as ResearchTask[]),
    candidateIds.length
      ? prisma.researchTask.findMany({
          where: { candidateId: { in: candidateIds }, status: "failed" },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([] as ResearchTask[]),
  ]);

  const activeByCandidate = new Map<string, ResearchTask[]>();
  for (const task of activeTasks) {
    if (!task.candidateId) continue;
    const list = activeByCandidate.get(task.candidateId) ?? [];
    list.push(task);
    activeByCandidate.set(task.candidateId, list);
  }
  const latestFailedByCandidate = new Map<string, ResearchTask>();
  for (const task of failedTasks) {
    if (!task.candidateId || latestFailedByCandidate.has(task.candidateId)) continue;
    latestFailedByCandidate.set(task.candidateId, task);
  }

  return {
    body: listBody(
      items.map((candidate) => {
        const source = decisionSourceOf(candidate);
        // 사람 판단에 이유가 없으면 null이다 — 시스템 이유를 사람 이유처럼 보여주지 않는다.
        const summary =
          source === "human"
            ? (candidate.activeHumanDecision?.reason ?? null)
            : (candidate.latestSystemAssessment?.summary ?? null);

        return {
          id: candidate.id,
          searchRunId: candidate.originSearchRunId,
          revision: candidate.revision,
          company: serializeCompany(candidate.company),
          fit: {
            effectiveVerdict: serializeEffectiveFit(candidate.effectiveFit),
            decisionSource: source,
            systemVerdict: candidate.latestSystemAssessment?.verdict ?? null,
            humanVerdict: candidate.activeHumanDecision?.verdict ?? null,
            summary,
          },
          contacts: {
            status: candidate.contactResearchStatus,
            usableCount: candidate.usableContactCount,
            needsVerificationCount: candidate.needsVerificationContactCount,
          },
          activeTasks: (activeByCandidate.get(candidate.id) ?? []).map(serializeResearchTask),
          latestFailedTask: latestFailedByCandidate.has(candidate.id)
            ? serializeResearchTask(latestFailedByCandidate.get(candidate.id)!)
            : null,
          updatedAt: candidate.updatedAt.toISOString(),
        };
      }),
      nextCursor,
    ),
  };
});
