import { prisma } from "../prisma";
import { computeOutreachState, type OutreachAction } from "../stateMachine";

// outreach 상세 조회(#06)와, 쓰기 엔드포인트(#16~29)가 변경 후 돌려주는 "갱신된
// outreach" 응답이 공유하는 직렬화 지점. responseStatus는 컬럼이 아니라 이
// outreach의 최신 Response.result에서 계산한다 (없으면 "unchecked") — 05 문서의
// response_result 축과 api-contract.md의 responseStatus 필드를 잇는 지점.
export async function serializeOutreachDetail(outreachId: string) {
  const outreach = await prisma.outreach.findUnique({
    where: { id: outreachId },
    include: {
      company: true,
      recipientContact: true,
      recipientEndpoint: true,
      responses: { orderBy: { checkedAt: "desc" }, take: 1 },
      draftRevisions: { orderBy: { revision: "desc" }, take: 1 },
    },
  });
  if (!outreach) return null;

  const latestResponse = outreach.responses[0] ?? null;
  const latestDraft = outreach.draftRevisions[0] ?? null;

  const templateBound = Boolean(
    await prisma.template.findFirst({
      where: { route: outreach.route, active: true },
      select: { id: true },
    }),
  );

  const { allowedActions, blockedReasons } = computeOutreachState({
    route: outreach.route,
    workStage: outreach.workStage,
    internalDecision: outreach.internalDecision,
    currentCycleId: outreach.currentCycleId,
    lastSentCycleId: outreach.lastSentCycleId,
    recipientContactId: outreach.recipientContactId,
    currentRevision: outreach.currentRevision,
    approvedRevision: outreach.approvedRevision,
    companyPermanentlyExcluded: outreach.company.permanentlyExcluded,
    latestResponse: latestResponse ? { result: latestResponse.result } : null,
    templateBound,
  });

  return {
    id: outreach.id,
    companyId: outreach.companyId,
    cycleId: outreach.currentCycleId,
    version: outreach.version,
    route: outreach.route,
    workStage: outreach.workStage,
    internalDecision: outreach.internalDecision,
    responseStatus: latestResponse?.result ?? "unchecked",
    recipient: outreach.recipientContactId
      ? {
          contactId: outreach.recipientContactId,
          endpointId: outreach.recipientEndpointId,
          name: outreach.recipientContact?.name ?? null,
          title: outreach.recipientContact?.title ?? null,
        }
      : null,
    draft: latestDraft
      ? {
          revision: latestDraft.revision,
          topic: latestDraft.topic,
          subject: latestDraft.subject,
          body: latestDraft.body,
          approvedRevision: outreach.approvedRevision,
          templateUsed: latestDraft.templateId
            ? { id: latestDraft.templateId, version: latestDraft.templateVersion }
            : null,
        }
      : null,
    latestResponse: latestResponse
      ? {
          id: latestResponse.id,
          result: latestResponse.result,
          category: latestResponse.category,
          note: latestResponse.explanation,
          revisitCondition: latestResponse.revisitCondition,
          checkedAt: latestResponse.checkedAt.toISOString(),
          checkedById: latestResponse.checkedById,
        }
      : null,
    reviewNote: outreach.reviewNote,
    conditionEvidence: outreach.conditionEvidence,
    allowedActions: allowedActions satisfies OutreachAction[],
    blockedReasons,
  };
}
