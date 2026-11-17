import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getReviewCandidateDetail } from "@/dh/lib/humanReview/detail";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { upsertRecipient, validAddress } from "@/dh/lib/humanReview/recipientUpsert";
import { isRoundOpen } from "@/dh/lib/rounds";
import { prisma } from "@/lib/prisma";

const recipientInput = z.object({
  expectedRevision: z.number().int().positive(),
  contactId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().max(200).optional(),
  channel: z.enum(["linkedin", "email"]),
  address: z.string().trim().min(1).max(1000),
}).strict();

export const PUT = withListupApiHandler<{ candidateId: string }>(async (req, { member, params }) => {
  const parsed = recipientInput.safeParse(await req.json());
  if (!parsed.success || !validAddress(parsed.data.channel, parsed.data.address))
    throw new ApiError("VALIDATION_ERROR", "관계자 이름 또는 연락 주소가 올바르지 않습니다.");
  const current = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { reviewOwnerId: true, originCollectedCompanyId: true },
  });
  if (!current?.originCollectedCompanyId) throw new ApiError("NOT_FOUND", "검토 후보를 찾지 못했습니다.");
  requireReviewOwner(member, current.reviewOwnerId);

  const input = parsed.data;
  return withIdempotency(req, member, `/review-candidates/${params.candidateId}/recipient`, input, async (tx) => {
    const candidate = await tx.candidate.findUniqueOrThrow({
      where: { id: params.candidateId },
      select: {
        companyId: true, selectedContactId: true, reviewStatus: true, currentResearchId: true,
        activeReviewDecision: { select: { note: true } },
        outreaches: {
          select: {
            id: true, version: true, sendStatus: true,
            acquisitionRound: { select: { endedAt: true } },
            sentMessages: { select: { id: true }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (input.contactId && input.contactId !== candidate.selectedContactId)
      throw new ApiError("STATE_CONFLICT", "현재 선택된 관계자만 수정할 수 있습니다. 다시 불러온 뒤 수정하세요.");
    // 승인한 뒤에도 발송 전이면 관계자를 바로 고칠 수 있다. 검토를 다시 열고 재승인하게 하지 않는다.
    const approved = candidate.reviewStatus === "approved";
    const work = approved ? candidate.outreaches[0] : undefined;
    const researchId = candidate.currentResearchId;
    if (approved && !researchId)
      throw new ApiError("STATE_CONFLICT", "조사가 준비된 후보만 관계자를 수정할 수 있습니다.");
    if (work && (work.sendStatus !== "before_send" || work.sentMessages.length))
      throw new ApiError("STATE_CONFLICT", "발송 완료 후 수신자를 변경할 수 없습니다.");
    const changed = await tx.candidate.updateMany({
      where: {
        id: params.candidateId,
        reviewOwnerId: member.id,
        revision: input.expectedRevision,
        researchStatus: "ready",
        reviewStatus: approved ? "approved" : { in: ["unreviewed", "reviewing"] },
      },
      data: { ...(approved ? {} : { reviewStatus: "reviewing" as const }), revision: { increment: 1 } },
    });
    if (!changed.count)
      throw new ApiError("REVISION_CONFLICT", "후보 상태가 바뀌었습니다. 새로고침 후 다시 입력하세요.");

    const { contactId, endpointId, channel } = await upsertRecipient(tx, candidate.companyId, input);
    if (!approved) {
      await tx.candidate.update({
        where: { id: params.candidateId },
        data: { selectedContactId: contactId, selectedEndpointId: endpointId },
      });
    } else {
      // 승인 기록은 덮어쓰지 않고 바뀐 관계자로 한 줄 더 남긴다. 누가 언제 수신자를 바꿨는지 이력이 된다.
      const decision = await tx.candidateReviewDecision.create({
        data: {
          candidateId: params.candidateId,
          action: "approve",
          fit: "fit",
          contactResult: "confirmed",
          researchId: researchId!,
          contactId,
          endpointId,
          note: candidate.activeReviewDecision?.note ?? null,
          decidedById: member.id,
        },
      });
      await tx.candidate.update({
        where: { id: params.candidateId },
        data: { selectedContactId: contactId, selectedEndpointId: endpointId, activeReviewDecisionId: decision.id },
      });
      // 진행 중인 메시지 작업이 있으면 수신자를 함께 바꾼다. 이미 만든 초안은 지우지 않고,
      // 문맥이 달라졌다는 표시만 남아 담당자가 호칭을 고치거나 다시 생성한다.
      if (work && isRoundOpen(work)) {
        const synced = await tx.outreach.updateMany({
          where: { id: work.id, version: work.version, sendStatus: "before_send" },
          data: {
            recipientContactId: contactId,
            recipientEndpointId: endpointId,
            selectedChannel: channel,
            selectionVersion: { increment: 1 },
            version: { increment: 1 },
          },
        });
        if (!synced.count) throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
      }
    }
    return {
      status: 200,
      body: { data: await getReviewCandidateDetail(tx, params.candidateId, member.id) },
    };
  }, { maxWait: 10_000, timeout: 15_000 });
});
