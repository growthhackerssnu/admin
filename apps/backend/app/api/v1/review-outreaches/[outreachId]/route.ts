import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader, requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { withIdempotency } from "@/dh/lib/idempotency";
import { assertRoundOpen } from "@/dh/lib/rounds";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const purposeInput = z.object({
  expectedVersion: z.number().int().positive(),
  contactPurpose: z.string().max(2000),
}).strict();

export const GET = withListupApiHandler<{ outreachId: string }>(async (_req, { member, params }) => {
  requireExternalReader(member);
  return { body: { data: await getHumanOutreachDetail(prisma, params.outreachId, member) } };
});

export const PATCH = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = purposeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "연락 목적 요청이 올바르지 않습니다.");
  const owner = await prisma.outreach.findUnique({
    where: { id: params.outreachId },
    select: { ownerId: true },
  });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, owner.ownerId);
  const input = parsed.data;
  return withIdempotency(req, member, `PATCH /review-outreaches/${params.outreachId}`, input, async (tx) => {
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
      throw new ApiError("STATE_CONFLICT", "발송 완료된 작업의 목적은 수정할 수 없습니다.");
    assertRoundOpen(outreach);
    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: { contactPurpose: input.contactPurpose.trim() || null, version: { increment: 1 } },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    return { status: 200, body: { data: await getHumanOutreachDetail(tx, outreach.id, member) } };
  });
});
