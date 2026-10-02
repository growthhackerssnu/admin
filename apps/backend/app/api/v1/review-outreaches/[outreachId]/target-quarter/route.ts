import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const changeInput = z.object({
  expectedVersion: z.number().int().positive(),
  targetQuarterId: z.string().min(1),
}).strict();

export const PATCH = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = changeInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "목표 분기 변경 요청이 올바르지 않습니다.");
  const owner = await prisma.outreach.findUnique({ where: { id: params.outreachId }, select: { ownerId: true } });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, owner.ownerId);
  const input = parsed.data;
  return withIdempotency(req, member, `/review-outreaches/${params.outreachId}/target-quarter`, input, async (tx) => {
    const [outreach, quarter] = await Promise.all([
      tx.outreach.findUniqueOrThrow({
        where: { id: params.outreachId },
        include: { sentMessages: { select: { id: true }, take: 1 } },
      }),
      tx.targetQuarter.findUnique({ where: { id: input.targetQuarterId } }),
    ]);
    if (!quarter) throw new ApiError("VALIDATION_ERROR", "목표 분기를 찾지 못했습니다.");
    if (outreach.version !== input.expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
      throw new ApiError("STATE_CONFLICT", "발송 후에는 목표 분기를 바꿀 수 없습니다.");
    if (outreach.currentTargetQuarterId === input.targetQuarterId)
      return { status: 200, body: { data: await getHumanOutreachDetail(tx, outreach.id) } };
    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: { currentTargetQuarterId: quarter.id, version: { increment: 1 } },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    await tx.outreachTargetQuarterChange.create({
      data: {
        outreachId: outreach.id,
        fromTargetQuarterId: outreach.currentTargetQuarterId,
        toTargetQuarterId: quarter.id,
        changedById: member.id,
      },
    });
    return { status: 200, body: { data: await getHumanOutreachDetail(tx, outreach.id) } };
  });
});
