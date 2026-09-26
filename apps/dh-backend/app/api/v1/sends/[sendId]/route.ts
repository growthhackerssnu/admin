import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /sends/{sendId} — 발송 당시 스냅샷, 읽기 전용
export const GET = withApiHandler<{ sendId: string }>(async (_req, { params }) => {
  const send = await prisma.sentMessage.findUnique({ where: { id: params.sendId } });
  if (!send) throw new ApiError("NOT_FOUND", "발송 기록을 찾을 수 없습니다.");

  return {
    body: successBody({
      id: send.id,
      outreach_id: send.outreachId,
      quarter_id: send.quarterId,
      channel: send.channel,
      status: send.status,
      recipient_name_snapshot: send.recipientNameSnapshot,
      address_snapshot: send.addressSnapshot,
      subject_snapshot: send.subjectSnapshot,
      body_snapshot: send.bodySnapshot,
      template_used: send.templateId ? { id: send.templateId, version: send.templateVersion } : null,
      sent_at: send.sentAt.toISOString(),
    }),
  };
});
