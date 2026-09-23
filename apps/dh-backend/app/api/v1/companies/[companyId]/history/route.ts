import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type HistoryEvent = {
  type: "sent" | "response" | "job";
  at: string;
  actorId: string | null;
  ref: Record<string, unknown>;
};

// #08 GET /companies/{companyId}/history?cycleId&cursor&limit
// 01 문서: "문자열 배열 대신 구조화된 이벤트를 제안" — responses + sent_messages +
// jobs를 합쳐 시간순 파생 타임라인으로 구성한다.
export const GET = withApiHandler<{ companyId: string }>(async (req, { params, requestId }) => {
  const { searchParams } = new URL(req.url);
  const cycleId = searchParams.get("cycleId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

  const outreach = await prisma.outreach.findUnique({
    where: { companyId: params.companyId },
    select: { id: true },
  });
  if (!outreach) throw new ApiError("NOT_FOUND", "기업의 컨택 건을 찾을 수 없습니다.");

  const [sends, responses, jobs] = await Promise.all([
    prisma.sentMessage.findMany({
      where: { outreachId: outreach.id, ...(cycleId ? { cycleId } : {}) },
      orderBy: { sentAt: "desc" },
    }),
    prisma.response.findMany({
      where: { outreachId: outreach.id },
      orderBy: { checkedAt: "desc" },
    }),
    prisma.job.findMany({
      where: { targetType: "outreach", targetId: outreach.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const events: HistoryEvent[] = [
    ...sends.map((s) => ({
      type: "sent" as const,
      at: s.sentAt.toISOString(),
      actorId: null,
      ref: { sendId: s.id, channel: s.channel, subject: s.subjectSnapshot },
    })),
    ...responses.map((r) => ({
      type: "response" as const,
      at: r.checkedAt.toISOString(),
      actorId: r.checkedById,
      ref: { responseId: r.id, result: r.result, category: r.category },
    })),
    ...jobs.map((j) => ({
      type: "job" as const,
      at: (j.finishedAt ?? j.createdAt).toISOString(),
      actorId: null,
      ref: { jobId: j.id, jobType: j.type, status: j.status },
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    body: successBody({ items: events.slice(0, limit), nextCursor: null }, requestId),
  };
});
