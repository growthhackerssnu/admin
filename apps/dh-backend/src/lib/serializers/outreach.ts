import type { Prisma, PrismaClient } from "@/generated/prisma";
import { prisma } from "../prisma";
import { computeOutreachState, type OutreachAction } from "../stateMachine";

type DbClient = PrismaClient | Prisma.TransactionClient;

// outreach 상세 조회와, 쓰기 엔드포인트가 변경 후 돌려주는 "갱신된 outreach" 응답이
// 공유하는 직렬화 지점. response_status는 컬럼이 아니라 이 outreach의 최신
// Response.result에서 계산한다(없으면 "unchecked").
//
// company 하위 객체는 예전 GET /companies/{id}가 돌려주던 발송용 필드를 옮겨온 것이다.
// 그 경로는 이제 명세의 "기업 식별 정보"만 돌려준다.
//
// 쓰기 엔드포인트는 db에 트랜잭션 클라이언트(tx)를 넘겨서, 방금 커밋 전인
// 변경사항을 같은 트랜잭션 안에서 그대로 읽어 응답을 만든다.
export async function serializeOutreachDetail(outreachId: string, db: DbClient = prisma) {
  const outreach = await db.outreach.findUnique({
    where: { id: outreachId },
    include: {
      company: { include: { pastProjects: true } },
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
    await db.template.findFirst({
      where: { route: outreach.route, active: true },
      select: { id: true },
    }),
  );

  const { allowedActions, blockedReasons } = computeOutreachState({
    route: outreach.route,
    workStage: outreach.workStage,
    internalDecision: outreach.internalDecision,
    quarterId: outreach.quarterId,
    lastSentQuarterId: outreach.lastSentQuarterId,
    recipientContactId: outreach.recipientContactId,
    currentRevision: outreach.currentRevision,
    approvedRevision: outreach.approvedRevision,
    companyPermanentlyExcluded: outreach.company.permanentlyExcluded,
    latestResponse: latestResponse ? { result: latestResponse.result } : null,
    templateBound,
  });

  return {
    id: outreach.id,
    company_id: outreach.companyId,
    quarter_id: outreach.quarterId,
    version: outreach.version,
    route: outreach.route,
    work_stage: outreach.workStage,
    internal_decision: outreach.internalDecision,
    response_status: latestResponse?.result ?? "unchecked",
    company: {
      id: outreach.company.id,
      name: outreach.company.name,
      product: outreach.company.product,
      domain: outreach.company.domain,
      version: outreach.company.version,
      permanently_excluded: outreach.company.permanentlyExcluded,
      permanently_excluded_reason: outreach.company.permanentlyExcludedReason,
      is_prelaunch_only: outreach.company.isPrelaunchOnly,
      past_projects: outreach.company.pastProjects.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        notion_url: p.notionUrl,
      })),
    },
    recipient: outreach.recipientContactId
      ? {
          contact_id: outreach.recipientContactId,
          endpoint_id: outreach.recipientEndpointId,
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
          approved_revision: outreach.approvedRevision,
          template_used: latestDraft.templateId
            ? { id: latestDraft.templateId, version: latestDraft.templateVersion }
            : null,
        }
      : null,
    latest_response: latestResponse
      ? {
          id: latestResponse.id,
          result: latestResponse.result,
          category: latestResponse.category,
          note: latestResponse.explanation,
          revisit_condition: latestResponse.revisitCondition,
          checked_at: latestResponse.checkedAt.toISOString(),
          checked_by_id: latestResponse.checkedById,
        }
      : null,
    review_note: outreach.reviewNote,
    condition_evidence: outreach.conditionEvidence,
    allowed_actions: allowedActions satisfies OutreachAction[],
    blocked_reasons: blockedReasons,
  };
}
