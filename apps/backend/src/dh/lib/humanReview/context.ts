import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";

type Tx = Prisma.TransactionClient;

export type ContextOutreach = {
  id: string;
  companyId: string;
  contactPurpose: string | null;
  recipientContactId: string | null;
  recipientEndpointId: string | null;
  currentTargetQuarterId: string;
  acquisitionRoundId: string | null;
  candidate: {
    reviewStatus: string | null;
    currentResearchId: string | null;
    activeReviewDecisionId: string | null;
  } | null;
};

// 재연락 초안이 근거로 쓴 이전 연락의 스냅샷. 문안 생성 당시 내용을 그대로 보존한다.
export type ProjectSnapshot = {
  id: string;
  version: number;
  title: string;
  year: number | null;
  quarter: number | null;
  status: string | null;
  summary: string | null;
  resultUrl: string | null;
};

export type HistorySnapshot = {
  key: string;
  projects: ProjectSnapshot[];
  outreaches: {
    outreachId: string;
    acquisitionRoundId: string | null;
    sentMessages: { id: string; sentAt: string; channel: string; recipientName: string; subject: string; body: string }[];
    responses: { id: string; result: string; explanation: string | null; revisitCondition: string | null; checkedAt: string }[];
    outcomeEvents: { id: string; fromStatus: string | null; toStatus: string; note: string | null; source: string; recordedAt: string }[];
  }[];
};

export type OutreachContext = {
  researchId: string | null;
  reviewDecisionId: string | null;
  history: HistorySnapshot | null;
  fingerprint: string;
  hasEvidence: boolean;
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// 신규 후보 작업의 근거는 후보의 현재 조사·승인 판단이다. 후보가 없는 재연락·재협업 작업의
// 근거는 기업의 최신 저장 조사와 이전 연락 이력이며, 생성 중 웹 검색은 하지 않는다.
export async function loadOutreachContext(tx: Tx, row: ContextOutreach): Promise<OutreachContext> {
  let researchId: string | null;
  let reviewDecisionId: string | null = null;
  let history: HistorySnapshot | null = null;
  let hasEvidence: boolean;

  if (row.candidate) {
    researchId = row.candidate.currentResearchId;
    reviewDecisionId = row.candidate.activeReviewDecisionId;
    hasEvidence = row.candidate.reviewStatus === "approved" && researchId !== null;
  } else {
    const [research, prior, projectRows] = await Promise.all([
      tx.companyResearch.findFirst({
        where: { companyId: row.companyId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      }),
      tx.outreach.findMany({
        where: { companyId: row.companyId, id: { not: row.id }, sentMessages: { some: {} } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          acquisitionRoundId: true,
          sentMessages: { orderBy: [{ sentAt: "asc" }, { id: "asc" }] },
          responses: { orderBy: [{ checkedAt: "asc" }, { id: "asc" }] },
          outcomeEvents: { orderBy: [{ recordedAt: "asc" }, { id: "asc" }] },
        },
      }),
      tx.pastProject.findMany({ where: { companyId: row.companyId }, orderBy: { id: "asc" } }),
    ]);
    researchId = research?.id ?? null;
    const projects = projectRows.map((project) => ({
      id: project.id,
      version: project.version,
      title: project.title,
      year: project.year,
      quarter: project.quarter,
      status: project.status,
      summary: project.summary,
      resultUrl: project.resultUrl,
    }));
    const outreaches = prior.map((item) => ({
      outreachId: item.id,
      acquisitionRoundId: item.acquisitionRoundId,
      sentMessages: item.sentMessages.map((sent) => ({
        id: sent.id,
        sentAt: sent.sentAt.toISOString(),
        channel: sent.channel,
        recipientName: sent.recipientNameSnapshot,
        subject: sent.subjectSnapshot,
        body: sent.bodySnapshot,
      })),
      responses: item.responses.map((response) => ({
        id: response.id,
        result: response.result,
        explanation: response.explanation,
        revisitCondition: response.revisitCondition,
        checkedAt: response.checkedAt.toISOString(),
      })),
      outcomeEvents: item.outcomeEvents.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        note: event.note,
        source: event.source,
        recordedAt: event.recordedAt.toISOString(),
      })),
    }));
    // 프로젝트는 id와 version만 키에 넣는다. 사람이 프로젝트를 고치면 version이 올라가
    // 그 프로젝트를 근거로 만든 초안이 문맥 불일치로 표시된다.
    const key = hash([
      outreaches.map((item) => [
        item.outreachId,
        item.sentMessages.map((sent) => sent.id),
        item.responses.map((response) => response.id),
        item.outcomeEvents.map((event) => event.id),
      ]),
      projects.map((project) => [project.id, project.version]),
    ]);
    history = { key, projects, outreaches };
    hasEvidence = outreaches.length > 0 || projects.length > 0 || researchId !== null;
  }

  const fingerprint = hash([
    row.contactPurpose ?? null,
    row.recipientContactId,
    row.recipientEndpointId,
    row.acquisitionRoundId,
    row.currentTargetQuarterId,
    researchId,
    reviewDecisionId,
    history?.key ?? null,
  ]).slice(0, 32);
  return { researchId, reviewDecisionId, history, fingerprint, hasEvidence };
}

type DraftContext = {
  generationResearchId: string | null;
  generationReviewDecisionId: string | null;
  recipientContactId: string | null;
  recipientEndpointId: string | null;
  targetQuarterId: string | null;
  contactPurposeSnapshot: string | null;
  generationHistory: unknown;
};

// 초안을 만들 때의 문맥과 지금 문맥이 다른 이유. 비어 있으면 일치한다.
export function draftContextMismatch(
  draft: DraftContext,
  row: Pick<ContextOutreach, "contactPurpose" | "recipientContactId" | "recipientEndpointId" | "currentTargetQuarterId">,
  ctx: OutreachContext,
) {
  const reasons: string[] = [];
  if (draft.generationResearchId !== ctx.researchId) reasons.push("research_changed");
  if (draft.generationReviewDecisionId !== ctx.reviewDecisionId) reasons.push("review_changed");
  if (row.recipientContactId !== draft.recipientContactId || row.recipientEndpointId !== draft.recipientEndpointId)
    reasons.push("recipient_changed");
  if (row.currentTargetQuarterId !== draft.targetQuarterId) reasons.push("quarter_changed");
  if ((row.contactPurpose ?? null) !== (draft.contactPurposeSnapshot ?? null)) reasons.push("purpose_changed");
  const draftHistoryKey = (draft.generationHistory as { key?: string } | null)?.key ?? null;
  if (draftHistoryKey !== (ctx.history?.key ?? null)) reasons.push("history_changed");
  return reasons;
}
