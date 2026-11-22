import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead, requireExternalReader } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { assertRoundOpen } from "@/dh/lib/rounds";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const cancelInput = z.object({
  expectedVersion: z.number().int().positive(),
}).strict();

// 잘못 누른 "발송 완료"를 되돌린다. 기록한 발송을 지우고 작업을 발송 전 상태로 돌려서 다시 기록할 수 있게 한다.
// 회신을 기록하기 전(회신 대기이고 사람이 남긴 상태 기록·응답이 없음)이고 회차가 열려 있을 때만 허용한다.
// 권한은 회신 상태 기록과 같다: 작업 담당자 또는 팀장·관리자. 취소한 사실은 수주 결과 변경 이력에 남긴다.
export const POST = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = cancelInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "발송 취소 요청이 올바르지 않습니다.");
  requireExternalReader(member);
  const owner = await prisma.outreach.findUnique({ where: { id: params.outreachId }, select: { ownerId: true } });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  if (owner.ownerId !== member.id) requireExternalLead(member);
  const input = parsed.data;

  return withIdempotency(req, member, `/review-outreaches/${params.outreachId}/send-cancellation`, input, async (tx) => {
    const outreach = await tx.outreach.findUniqueOrThrow({
      where: { id: params.outreachId },
      select: {
        id: true,
        version: true,
        sendStatus: true,
        outcomeStatus: true,
        acquisitionRound: { select: { endedAt: true } },
        sentMessages: { select: { id: true, sentAt: true, recipientNameSnapshot: true, channel: true } },
        responses: { select: { id: true }, take: 1 },
        outcomeEvents: { where: { source: "manual" }, select: { id: true }, take: 1 },
      },
    });
    if (outreach.version !== input.expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    const sent = outreach.sentMessages[0];
    if (outreach.sendStatus !== "sent" || !sent)
      throw new ApiError("STATE_CONFLICT", "취소할 발송 기록이 없습니다.");
    assertRoundOpen(outreach);
    if (outreach.outcomeStatus !== "pending" || outreach.outcomeEvents.length || outreach.responses.length)
      throw new ApiError("STATE_CONFLICT", "회신 상태를 기록한 뒤에는 발송을 취소할 수 없습니다.");

    const changed = await tx.outreach.updateMany({
      where: { id: outreach.id, version: input.expectedVersion, sendStatus: "sent", outcomeStatus: "pending" },
      data: {
        sendStatus: "before_send",
        // 사람 검토 경로에서 발송 직전 단계는 초안 검토다(발송에는 현재 초안이 꼭 있어야 한다).
        workStage: "draft_review",
        // 작업 하나에는 첫 발송 한 번만 기록되므로 발송 전 값은 항상 비어 있다.
        lastSentQuarterId: null,
        outcomeStatus: null,
        version: { increment: 1 },
      },
    });
    if (!changed.count) throw new ApiError("STATE_CONFLICT", "다른 기록이 먼저 저장됐습니다. 다시 조회하세요.");
    await tx.sentMessage.deleteMany({ where: { outreachId: outreach.id } });
    await tx.outreachOutcomeEvent.create({
      data: {
        outreachId: outreach.id,
        fromStatus: "pending",
        toStatus: "pending",
        source: "send_cancel",
        actorId: member.id,
        note: `발송 기록 취소: ${sent.sentAt.toISOString()} ${sent.channel} ${sent.recipientNameSnapshot}`,
      },
    });
    return {
      status: 200,
      body: { data: { outreachId: outreach.id, outreachVersion: input.expectedVersion + 1, sendStatus: "before_send" } },
    };
  });
});
