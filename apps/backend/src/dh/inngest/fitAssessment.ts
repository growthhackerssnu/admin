import type { Prisma } from "@/generated/prisma";
import {
  FIT_INTERVENTION_AREAS,
  type FitCriteriaSnapshot,
} from "@/dh/config/fitCriteria";
import type { ConditionsSnapshot } from "@/dh/config/listupExecution";
import {
  LISTUP_GEMINI_MODEL,
  runStructuredOutput,
} from "@/dh/lib/listup/gemini";
import { LocalTaskReporter } from "@/dh/lib/listup/localObservability";
import { prisma } from "@/lib/prisma";
import { applyFitFollowup } from "@/dh/lib/listup/tasks";
import type { ResultRef } from "@/dh/lib/listup/types";
import { recomputeCandidateState } from "@/dh/lib/listup/state";
import { notifyWorker } from "@/dh/inngest/client";

const CRITERION_VERDICTS = ["supported", "unsupported", "unknown"] as const;
type CriterionVerdict = (typeof CRITERION_VERDICTS)[number];
type InterventionArea = (typeof FIT_INTERVENTION_AREAS)[number];

type RawIntervention = {
  area: string;
  possibilityVerdict: CriterionVerdict;
  possibilityReason: string;
  possibilityEvidenceIds: string[];
  prerequisites: string[];
  valueVerdict: CriterionVerdict;
  valueReason: string;
  valueEvidenceIds: string[];
  targetBusinessOutcome: string;
};

type NormalizedIntervention = Omit<RawIntervention, "area"> & {
  area: InterventionArea;
};

// 모델이 "AI 기업", "플랫폼" 같은 일반 표현을 6개 영역 전부에 재사용하지 못하게
// 하는 최소한의 공개 근거 검증이다. fit 자체는 한 영역만 직접 뒷받침되면 충분하다.
const AREA_SIGNAL_TERMS: Record<InterventionArea, readonly string[]> = {
  "사용자·고객 분석": [
    "행동",
    "이용",
    "사용 패턴",
    "방문",
    "여정",
    "세그먼트",
    "리텐션",
    "후기",
    "리뷰",
    "시청",
    "구매",
    "탐색",
    "클릭",
    "사용자",
    "고객",
    "회원",
    "앱",
    "콘텐츠",
    "교육",
    "예약",
    "거래",
    "결제",
    "platform",
    "marketplace",
    "게임",
    "game",
    "플레이어",
    "player",
    "학습관리",
    "학습자",
    "실시간",
    "오디오",
    "라디오",
    "청취",
    "청취자",
    "dj",
  ],
  "CRM·마케팅 최적화": [
    "crm",
    "캠페인",
    "광고",
    "마케팅",
    "쿠폰",
    "푸시",
    "전환",
    "재구매",
    "구독",
    "회원",
    "프로모션",
    "가격",
    "lms",
    "주문",
    "결제",
    "예약",
    "거래",
    "membership",
    "subscription",
    "commerce",
    "충전",
    "후원",
    "유료",
    "선물",
  ],
  "추천·개인화": [
    "추천",
    "개인화",
    "맞춤",
    "매칭",
    "랭킹",
    "정렬",
    "콘텐츠",
    "상품",
    "이벤트",
    "강의",
    "과정",
    "매장",
    "목록",
    "리스트",
    "marketplace",
    "catalog",
  ],
  "예측·분류·지표 개발": [
    "예측",
    "분류",
    "스코어",
    "평가 지표",
    "수요",
    "이탈",
    "확률",
    "forecast",
    "scoring",
  ],
  "데이터 기반 전략·운영 개선": [
    "운영",
    "비용",
    "가격",
    "배차",
    "스케줄",
    "물류",
    "재고",
    "공급",
    "용량",
    "효율",
    "프로세스",
    "라우팅",
    "할당",
    "제작",
    "지역",
    "매장",
    "스튜디오",
    "배송",
    "이동",
    "모빌리티",
    "입점",
    "가맹",
    "공유",
    "주문",
    "예약",
    "거래",
  ],
  "AI·데이터 파이프라인": [
    "파이프라인",
    "데이터 수집",
    "데이터 처리",
    "정제",
    "검색",
    "요약",
    "생성",
    "llm",
    "모델 호출",
    "오케스트레이션",
    "자동 라우팅",
    "프롬프트",
    "워크플로",
    "workflow",
    "자동 수집",
    "자동으로 수집",
    "데이터베이스",
    "database",
  ],
};

type FitOutput = {
  summary: string;
  informationGaps: string[];
  interventions: RawIntervention[];
};

function isCriterionVerdict(value: string): value is CriterionVerdict {
  return (CRITERION_VERDICTS as readonly string[]).includes(value);
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Fit assessment ${label} is required.`);
  return value.trim();
}

function stringList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`Fit assessment ${label} must be a string array.`);
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function evidenceIds(value: unknown, allowed: Set<string>, label: string) {
  const ids = stringList(value, label);
  if (ids.some((id) => !allowed.has(id)))
    throw new Error(
      `Fit assessment ${label} contains an unrelated Evidence ID.`,
    );
  return ids;
}

function normalizeCriterion(
  verdict: unknown,
  reason: unknown,
  ids: unknown,
  allowedEvidenceIds: Set<string>,
  label: string,
) {
  if (typeof verdict !== "string" || !isCriterionVerdict(verdict))
    throw new Error(`Fit assessment ${label} verdict is invalid.`);
  const normalizedReason = requiredText(reason, `${label} reason`);
  const normalizedIds = evidenceIds(
    ids,
    allowedEvidenceIds,
    `${label} evidence IDs`,
  );
  if (verdict === "supported" && !normalizedIds.length)
    throw new Error(`Supported ${label} needs Evidence.`);
  if (verdict === "unsupported" && !normalizedIds.length) {
    return {
      verdict: "unknown" as const,
      reason: `${normalizedReason} (근거 확인 필요)`,
      evidenceIds: [],
    };
  }
  return { verdict, reason: normalizedReason, evidenceIds: normalizedIds };
}

function hasDirectAreaSignal(
  area: InterventionArea,
  evidenceIds: string[],
  evidenceTexts: ReadonlyMap<string, string>,
) {
  if (!evidenceTexts.size) return true;
  const text = evidenceIds
    .map((id) => evidenceTexts.get(id) ?? "")
    .join(" ")
    .toLowerCase();
  return AREA_SIGNAL_TERMS[area].some((term) => text.includes(term));
}

function downgradeWithoutDirectSignal(
  criterion: {
    verdict: CriterionVerdict;
    reason: string;
    evidenceIds: string[];
  },
  area: InterventionArea,
  label: "possibility" | "value",
  evidenceTexts: ReadonlyMap<string, string>,
) {
  if (
    criterion.verdict !== "supported" ||
    hasDirectAreaSignal(area, criterion.evidenceIds, evidenceTexts)
  )
    return criterion;
  return {
    verdict: "unknown" as const,
    reason: `제공된 근거에 ${area} ${label}의 직접 신호가 확인되지 않음`,
    evidenceIds: [],
  };
}

export function normalizeInterventions(
  interventions: RawIntervention[],
  allowedEvidenceIds: Set<string>,
  evidenceTexts: ReadonlyMap<string, string> = new Map(),
): NormalizedIntervention[] {
  const byArea = new Map<string, RawIntervention>();
  for (const intervention of interventions) {
    if (
      !intervention ||
      typeof intervention.area !== "string" ||
      !(FIT_INTERVENTION_AREAS as readonly string[]).includes(
        intervention.area,
      ) ||
      byArea.has(intervention.area)
    )
      throw new Error(
        "Fit assessment must contain each intervention area once.",
      );
    byArea.set(intervention.area, intervention);
  }
  if (byArea.size !== FIT_INTERVENTION_AREAS.length)
    throw new Error("Fit assessment must contain all intervention areas.");

  return FIT_INTERVENTION_AREAS.map((area) => {
    const intervention = byArea.get(area);
    if (!intervention) throw new Error("Missing intervention area.");
    const possibility = downgradeWithoutDirectSignal(
      normalizeCriterion(
      intervention.possibilityVerdict,
      intervention.possibilityReason,
      intervention.possibilityEvidenceIds,
      allowedEvidenceIds,
      `${area} possibility`,
      ),
      area,
      "possibility",
      evidenceTexts,
    );
    const value = downgradeWithoutDirectSignal(
      normalizeCriterion(
      intervention.valueVerdict,
      intervention.valueReason,
      intervention.valueEvidenceIds,
      allowedEvidenceIds,
      `${area} value`,
      ),
      area,
      "value",
      evidenceTexts,
    );
    return {
      area,
      possibilityVerdict: possibility.verdict,
      possibilityReason: possibility.reason,
      possibilityEvidenceIds: possibility.evidenceIds,
      prerequisites: stringList(
        intervention.prerequisites,
        `${area} prerequisites`,
      ),
      valueVerdict: value.verdict,
      valueReason: value.reason,
      valueEvidenceIds: value.evidenceIds,
      targetBusinessOutcome: requiredText(
        intervention.targetBusinessOutcome,
        `${area} target business outcome`,
      ),
    };
  });
}

export function deriveFitVerdict(interventions: NormalizedIntervention[]) {
  if (
    interventions.some(
      (item) =>
        item.possibilityVerdict === "supported" &&
        item.valueVerdict === "supported",
    )
  )
    return "fit" as const;
  if (
    interventions.some(
      (item) =>
        item.possibilityVerdict === "unknown" ||
        item.valueVerdict === "unknown",
    )
  )
    return "pending" as const;
  return "unfit" as const;
}

function collectInformationGaps(
  researchGaps: string[],
  reportedGaps: unknown,
) {
  return [
    ...new Set([
      ...researchGaps,
      ...stringList(reportedGaps, "information gaps"),
    ]),
  ].slice(0, 30);
}

function fitInput(
  criteria: FitCriteriaSnapshot,
  company: { name: string; legalName: string | null; aliases: string[] },
  research: {
    id: string;
    claims: {
      category: string;
      content: string;
      basis: string;
      evidenceIds: string[];
    }[];
    missingInformation: string[];
  },
  evidence: {
    id: string;
    url: string;
    title: string | null;
    excerpt: string | null;
  }[],
) {
  return [
    "You are the GHS SNU company-fit assessment agent.",
    "Use only the following criteria and research report. Do not browse, search, or add facts.",
    "Assess public business compatibility, not confirmed delivery feasibility. Do not downgrade a supported public business signal merely because data access, KPIs, decision owners, campaign data, or an internal brief are unknown.",
    "Judge each intervention area separately. A generic claim that the company is digital, SaaS, AI-enabled, or has customers must not be reused as support for unrelated areas.",
    "Return every intervention area exactly once. Cite only supplied Evidence IDs.",
    "Use unknown, rather than unsupported, when the report does not support a negative conclusion.",
    `Criteria version: ${criteria.version}`,
    criteria.systemPrompt,
    JSON.stringify({ company, research, evidence }),
  ].join("\n\n");
}

const fitSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "informationGaps", "interventions"],
  properties: {
    summary: { type: "string" },
    informationGaps: { type: "array", items: { type: "string" } },
    interventions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "area",
          "possibilityVerdict",
          "possibilityReason",
          "possibilityEvidenceIds",
          "prerequisites",
          "valueVerdict",
          "valueReason",
          "valueEvidenceIds",
          "targetBusinessOutcome",
        ],
        properties: {
          area: { type: "string", enum: FIT_INTERVENTION_AREAS },
          possibilityVerdict: { type: "string", enum: CRITERION_VERDICTS },
          possibilityReason: { type: "string" },
          possibilityEvidenceIds: { type: "array", items: { type: "string" } },
          prerequisites: { type: "array", items: { type: "string" } },
          valueVerdict: { type: "string", enum: CRITERION_VERDICTS },
          valueReason: { type: "string" },
          valueEvidenceIds: { type: "array", items: { type: "string" } },
          targetBusinessOutcome: { type: "string" },
        },
      },
    },
  },
};

function savedRefs(value: unknown): ResultRef[] {
  return Array.isArray(value) ? (value as ResultRef[]) : [];
}

async function claimFitTask(taskId: string, runId: string) {
  const task = await prisma.researchTask.findUnique({ where: { id: taskId } });
  if (!task || task.type !== "fit_assessment") return null;
  const claim = await prisma.researchTask.updateMany({
    where: { id: taskId, status: "queued" },
    data: {
      status: "running",
      jobId: runId,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      errorRetryable: null,
    },
  });
  if (claim.count) return true;
  if (task.status !== "running" || task.jobId !== runId) return false;
  await prisma.researchTask.update({
    where: { id: taskId },
    data: { attempt: { increment: 1 } },
  });
  return true;
}

export async function executeFitAssessmentTask(taskId: string, runId: string) {
  const claimed = await claimFitTask(taskId, runId);
  if (!claimed) return { ignored: true };
  const reporter = new LocalTaskReporter(taskId, "fit_assessment");
  try {
    const task = await prisma.researchTask.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        searchRun: { select: { conditionsSnapshot: true, status: true } },
        candidate: {
          include: {
            company: true,
            currentResearch: { include: { claims: true } },
          },
        },
      },
    });
    if (task.searchRun.status === "cancelled") {
      await prisma.researchTask.update({
        where: { id: task.id },
        data: { status: "cancelled", finishedAt: new Date() },
      });
      return { cancelled: true };
    }
    if (!task.candidate?.currentResearch)
      throw new Error("Fit assessment task has no current company research.");

    const snapshot = task.searchRun
      .conditionsSnapshot as unknown as ConditionsSnapshot;
    const research = task.candidate.currentResearch;
    const evidenceIds = [
      ...new Set(research.claims.flatMap((claim) => claim.evidenceIds)),
    ];
    const evidence = await prisma.evidence.findMany({
      where: { id: { in: evidenceIds }, companyId: task.candidate.companyId },
      select: { id: true, url: true, title: true, excerpt: true },
    });
    const allowedEvidenceIds = new Set(evidence.map((item) => item.id));
    const report = await runStructuredOutput<FitOutput>(
      fitInput(
        snapshot.fitCriteria,
        task.candidate.company,
        research,
        evidence,
      ),
      fitSchema,
      {
        onComplete: (metric) =>
          reporter.captureAiCall("fit_assessment", metric),
      },
    );
    const interventions = normalizeInterventions(
      report.value.interventions,
      allowedEvidenceIds,
      new Map(
        evidence.map((item) => [
          item.id,
          [item.title, item.excerpt].filter(Boolean).join(" "),
        ]),
      ),
    );
    const verdict = deriveFitVerdict(interventions);
    const informationGaps = collectInformationGaps(
      research.missingInformation,
      report.value.informationGaps,
    );
    const summary = requiredText(report.value.summary, "summary");

    const result = await prisma.$transaction(async (tx) => {
      const running = await tx.researchTask.findUniqueOrThrow({
        where: { id: task.id },
        include: { candidate: true },
      });
      if (
        running.status !== "running" ||
        running.jobId !== runId ||
        !running.candidate
      )
        return null;
      if (running.candidate.currentResearchId !== research.id) {
        await tx.researchTask.update({
          where: { id: task.id },
          data: { status: "cancelled", finishedAt: new Date() },
        });
        return null;
      }

      const assessment = await tx.fitAssessment.create({
        data: {
          candidateId: running.candidate.id,
          researchId: research.id,
          verdict,
          summary,
          informationGaps,
          criteriaVersion: snapshot.fitCriteria.version,
          modelVersion: LISTUP_GEMINI_MODEL,
          interventions: { create: interventions },
        },
      });
      await tx.candidate.update({
        where: { id: running.candidate.id },
        data: { latestSystemAssessmentId: assessment.id },
      });

      const followup = running.candidate.activeHumanDecisionId
        ? null
        : await applyFitFollowup(tx, {
            candidateId: running.candidate.id,
            searchRunId: task.searchRunId,
            verdict,
            usableContactCount: running.candidate.usableContactCount,
            maxContactSearchRounds: snapshot.execution.maxContactSearchRounds,
          });
      await recomputeCandidateState(tx, running.candidate.id);

      const resultRefs: ResultRef[] = [
        ...savedRefs(running.resultRefs),
        {
          type: "source",
          sourceKey: "Gemini fit assessment",
          status: "succeeded",
          foundCount: FIT_INTERVENTION_AREAS.length,
          acceptedCount: FIT_INTERVENTION_AREAS.length,
          webSearchCallCount: 0,
          inputTokens: report.inputTokens,
          outputTokens: report.outputTokens,
        },
        { type: "fitAssessment", id: assessment.id },
      ];
      await tx.researchTask.update({
        where: { id: task.id },
        data: {
          status: "succeeded",
          resultRefs: resultRefs as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      return {
        assessmentId: assessment.id,
        verdict,
        contactTaskId: followup?.taskId ?? null,
      };
    });

    const output = result ?? { ignored: true };
    if (result?.contactTaskId) await notifyWorker(result.contactTaskId);
    reporter.finish("succeeded", {
      ...output,
      interventionCount: interventions.length,
    });
    return output;
  } catch (error) {
    reporter.finish("failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function markFitAssessmentFailed(taskId: string, message: string) {
  await prisma.researchTask.updateMany({
    where: { id: taskId, type: "fit_assessment", status: "running" },
    data: {
      status: "failed",
      errorCode: "SERVICE_UNAVAILABLE",
      errorMessage: message,
      errorRetryable: false,
      finishedAt: new Date(),
    },
  });
}

export async function queuedFitAssessmentTaskIds(limit = 50) {
  const tasks = await prisma.researchTask.findMany({
    where: { type: "fit_assessment", status: "queued" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return tasks.map((task) => task.id);
}
