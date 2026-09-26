import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertVersionMatch } from "@/lib/revision";
import { assertCanModify } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { saveDraftSchema } from "@/lib/validation/outreach";

// GET·PATCH /drafts/{outreachId}
// 우리 스키마엔 outreach 하나당 초안 스레드가 하나뿐이라(05 문서 §3 "컨택 건은
// 기업당 하나로 이어진다"), 계약상의 "draft_id"는 outreach_id로 쓴다 —
// message_draft_revisions 개별 행 id는 리비전 이력일 뿐 클라이언트가 안정적으로
// 들고 있을 식별자가 아니다.

export const GET = withApiHandler<{ outreachId: string }>(async (_req, { params }) => {
  const latest = await getLatestRevisionOrThrow(params.outreachId);
  return {
    body: successBody({
      outreachId: params.outreachId,
      revision: latest.revision,
      topic: latest.topic,
      subject: latest.subject,
      body: latest.body,
      approvedRevision: latest.outreach.approvedRevision,
      templateUsed: latest.templateId ? { id: latest.templateId, version: latest.templateVersion } : null,
    }),
  };
});

// 초안을 고치면 새 리비전을 append하고 승인은 해제된다(§6 확정 정책 9 "초안
// 재검토"). work_stage도 draft_review로 되돌린다 — ready_to_send에서 고쳤어도
// 다시 검토해야 한다.
export const PATCH = withApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const {
    expectedVersion,
    expectedRevision,
    topic,
    subject,
    body: draftBody,
  } = parsed.data;

  return withIdempotency(req, member, "PATCH /drafts/:outreachId", parsed.data, async (tx) => {
    const outreach = await tx.outreach.findUnique({ where: { id: params.outreachId } });
    assertVersionMatch(outreach, outreach?.version, expectedVersion);
    // 본인 담당 업무만 변경할 수 있다(P-23). 조회는 막지 않는다.
    assertCanModify(member, outreach.ownerId);

    if (outreach.currentRevision !== expectedRevision) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 초안을 수정했습니다. 최신 내용을 다시 확인해주세요.");
    }

    const nextRevision = (outreach.currentRevision ?? 0) + 1;
    await tx.messageDraftRevision.create({
      data: {
        outreachId: params.outreachId,
        revision: nextRevision,
        topic,
        subject,
        body: draftBody,
        createdBy: "admin_edit",
      },
    });

    const updateResult = await tx.outreach.updateMany({
      where: { id: params.outreachId, version: expectedVersion },
      data: {
        currentRevision: nextRevision,
        approvedRevision: null,
        workStage: "draft_review",
        version: { increment: 1 },
      },
    });
    if (updateResult.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    return { status: 200, body: successBody(await serializeOutreachDetail(params.outreachId, tx)) };
  });
});

async function getLatestRevisionOrThrow(outreachId: string) {
  const outreach = await prisma.outreach.findUnique({
    where: { id: outreachId },
    include: { draftRevisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
  if (!outreach || outreach.draftRevisions.length === 0) {
    throw new ApiError("NOT_FOUND", "초안을 찾을 수 없습니다.");
  }
  const latest = outreach.draftRevisions[0]!;
  return { ...latest, outreach };
}
