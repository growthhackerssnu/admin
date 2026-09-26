import type { ContactStatus, FitVerdict, Prisma, ResearchTask } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, listBody } from "@/lib/errors";
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
  const searchRunId = searchParams.get("search_run_id");
  const companyId = searchParams.get("company_id");
  const effectiveFit = searchParams.get("effective_fit");
  const contactStatus = searchParams.get("contact_status");
  const decisionSource = searchParams.get("decision_source");
  const q = searchParams.get("q");
  const sort = searchParams.get("sort") ?? "created_at_desc";

  if (effectiveFit && !(FIT_FILTERS as readonly string[]).includes(effectiveFit)) {
    throw new ApiError("INVALID_REQUEST", "effective_fit 값이 올바르지 않습니다.", { effective_fit: effectiveFit });
  }
  if (contactStatus && !CONTACT_STATUSES.includes(contactStatus as ContactStatus)) {
    throw new ApiError("INVALID_REQUEST", "contact_status 값이 올바르지 않습니다.", { contact_status: contactStatus });
  }
  if (decisionSource && !(DECISION_SOURCES as readonly string[]).includes(decisionSource)) {
    throw new ApiError("INVALID_REQUEST", "decision_source 값이 올바르지 않습니다.", { decision_source: decisionSource });
  }
  if (sort !== "created_at_desc" && sort !== "updated_at_desc") {
    throw new ApiError("INVALID_REQUEST", "sort 값이 올바르지 않습니다.", { sort });
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

  const { items, page } = buildPage(rows, limit);
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
          search_run_id: candidate.searchRunId,
          revision: candidate.revision,
          company: serializeCompany(candidate.company),
          fit: {
            effective_verdict: serializeEffectiveFit(candidate.effectiveFit),
            decision_source: source,
            system_verdict: candidate.latestSystemAssessment?.verdict ?? null,
            human_verdict: candidate.activeHumanDecision?.verdict ?? null,
            summary,
          },
          contacts: {
            status: candidate.contactStatus,
            usable_count: candidate.usableContactCount,
            needs_verification_count: candidate.needsVerificationContactCount,
          },
          active_tasks: (activeByCandidate.get(candidate.id) ?? []).map(serializeResearchTask),
          latest_failed_task: latestFailedByCandidate.has(candidate.id)
            ? serializeResearchTask(latestFailedByCandidate.get(candidate.id)!)
            : null,
          updated_at: candidate.updatedAt.toISOString(),
        };
      }),
      page,
    ),
  };
});
