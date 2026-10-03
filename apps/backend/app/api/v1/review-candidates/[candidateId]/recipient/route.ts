import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getReviewCandidateDetail } from "@/dh/lib/humanReview/detail";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { upsertRecipient, validAddress } from "@/dh/lib/humanReview/recipientUpsert";
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
      select: { companyId: true, selectedContactId: true },
    });
    if (input.contactId && input.contactId !== candidate.selectedContactId)
      throw new ApiError("STATE_CONFLICT", "현재 선택된 관계자만 수정할 수 있습니다. 다시 불러온 뒤 수정하세요.");
    const changed = await tx.candidate.updateMany({
      where: {
        id: params.candidateId,
        reviewOwnerId: member.id,
        revision: input.expectedRevision,
        researchStatus: "ready",
        reviewStatus: { in: ["unreviewed", "reviewing"] },
      },
      data: { reviewStatus: "reviewing", revision: { increment: 1 } },
    });
    if (!changed.count)
      throw new ApiError("REVISION_CONFLICT", "후보 상태가 바뀌었습니다. 새로고침 후 다시 입력하세요.");

    const { contactId, endpointId } = await upsertRecipient(tx, candidate.companyId, input);
    await tx.candidate.update({
      where: { id: params.candidateId },
      data: { selectedContactId: contactId, selectedEndpointId: endpointId },
    });
    return {
      status: 200,
      body: { data: await getReviewCandidateDetail(tx, params.candidateId, member.id) },
    };
  }, { maxWait: 10_000, timeout: 15_000 });
});
