import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { upsertRecipient, validAddress } from "@/dh/lib/humanReview/recipientUpsert";
import { assertRoundOpen } from "@/dh/lib/rounds";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const syncInput = z.object({
  expectedVersion: z.number().int().positive(),
  expectedCandidateRevision: z.number().int().positive(),
}).strict();

export const PATCH = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = syncInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "수신자 반영 요청이 올바르지 않습니다.");
  const owner = await prisma.outreach.findUnique({ where: { id: params.outreachId }, select: { ownerId: true } });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, owner.ownerId);
  const input = parsed.data;
  return withIdempotency(req, member, `/review-outreaches/${params.outreachId}/recipient`, input, async (tx) => {
    const outreach = await tx.outreach.findUniqueOrThrow({
      where: { id: params.outreachId },
      include: {
        candidate: { include: { selectedContact: true, selectedEndpoint: true, activeReviewDecision: true } },
        acquisitionRound: { select: { endedAt: true } },
        sentMessages: { select: { id: true }, take: 1 },
      },
    });
    if (outreach.version !== input.expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
      throw new ApiError("STATE_CONFLICT", "발송 완료 후 수신자를 변경할 수 없습니다.");
    assertRoundOpen(outreach);
    const candidate = outreach.candidate;
    if (
      !candidate || candidate.revision !== input.expectedCandidateRevision ||
      candidate.reviewStatus !== "approved" || candidate.activeReviewDecision?.action !== "approve" ||
      !candidate.selectedContact || !candidate.selectedEndpoint ||
      candidate.activeReviewDecision.contactId !== candidate.selectedContact.id ||
      candidate.activeReviewDecision.endpointId !== candidate.selectedEndpoint.id
    ) throw new ApiError("STATE_CONFLICT", "현재 승인된 수신자를 확인할 수 없습니다.");
    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: {
        recipientContactId: candidate.selectedContact.id,
        recipientEndpointId: candidate.selectedEndpoint.id,
        selectedChannel: candidate.selectedEndpoint.channel,
        selectionVersion: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    return { status: 200, body: { data: await getHumanOutreachDetail(tx, outreach.id, member) } };
  });
});

const directInput = z.object({
  expectedVersion: z.number().int().positive(),
  recipient: z.union([
    z.object({ contactId: z.string().min(1), endpointId: z.string().min(1) }).strict(),
    z.object({
      name: z.string().trim().min(1).max(150),
      title: z.string().trim().max(200).optional(),
      channel: z.enum(["linkedin", "email"]),
      address: z.string().trim().min(1).max(1000),
    }).strict(),
  ]),
}).strict();

// 후보 승인 없이 이 작업의 수신자를 직접 고르거나 입력한다. 후보에서 수신자를 가져오는
// PATCH와 달리 재연락·재협업 작업에서도 쓴다.
export const PUT = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = directInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "수신자 요청이 올바르지 않습니다.");
  const input = parsed.data;
  if ("address" in input.recipient && !validAddress(input.recipient.channel, input.recipient.address))
    throw new ApiError("VALIDATION_ERROR", "연락 주소 형식이 올바르지 않습니다.", {
      fieldErrors: { address: "이메일 또는 https LinkedIn /in/ 프로필 URL" },
    });
  const owner = await prisma.outreach.findUnique({ where: { id: params.outreachId }, select: { ownerId: true } });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, owner.ownerId);
  return withIdempotency(req, member, `PUT /review-outreaches/${params.outreachId}/recipient`, input, async (tx) => {
    const outreach = await tx.outreach.findUniqueOrThrow({
      where: { id: params.outreachId },
      include: {
        acquisitionRound: { select: { endedAt: true } },
        sentMessages: { select: { id: true }, take: 1 },
      },
    });
    if (outreach.version !== input.expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
      throw new ApiError("STATE_CONFLICT", "발송 완료 후 수신자를 변경할 수 없습니다.");
    assertRoundOpen(outreach);

    let contactId: string;
    let endpointId: string;
    let channel: "linkedin" | "email";
    if ("endpointId" in input.recipient) {
      const endpoint = await tx.contactEndpoint.findUnique({ where: { id: input.recipient.endpointId } });
      if (
        !endpoint || endpoint.companyId !== outreach.companyId ||
        endpoint.contactId !== input.recipient.contactId
      ) throw new ApiError("VALIDATION_ERROR", "이 기업의 관계자·연락 주소가 아닙니다.");
      contactId = input.recipient.contactId;
      endpointId = endpoint.id;
      channel = endpoint.channel;
    } else {
      ({ contactId, endpointId, channel } = await upsertRecipient(tx, outreach.companyId, input.recipient));
    }
    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: {
        recipientContactId: contactId,
        recipientEndpointId: endpointId,
        selectedChannel: channel,
        selectionVersion: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    return { status: 200, body: { data: await getHumanOutreachDetail(tx, outreach.id, member) } };
  }, { maxWait: 10_000, timeout: 15_000 });
});
