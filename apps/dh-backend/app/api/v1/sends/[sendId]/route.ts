import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// #09 GET /sends/{sendId} — 발송 당시 스냅샷, 읽기 전용
export const GET = withApiHandler<{ sendId: string }>(async (_req, { params, requestId }) => {
  const send = await prisma.sentMessage.findUnique({ where: { id: params.sendId } });
  if (!send) throw new ApiError("NOT_FOUND", "발송 기록을 찾을 수 없습니다.");

  return {
    body: successBody(
      {
        id: send.id,
        outreachId: send.outreachId,
        cycleId: send.cycleId,
        channel: send.channel,
        status: send.status,
        recipientNameSnapshot: send.recipientNameSnapshot,
        addressSnapshot: send.addressSnapshot,
        subjectSnapshot: send.subjectSnapshot,
        bodySnapshot: send.bodySnapshot,
        templateUsed: send.templateId ? { id: send.templateId, version: send.templateVersion } : null,
        sentAt: send.sentAt.toISOString(),
      },
      requestId,
    ),
  };
});
