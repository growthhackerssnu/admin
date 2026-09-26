import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, listBody } from "@/lib/errors";
import { parseLimit } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

type HistoryEvent = {
  type: "sent" | "response" | "job";
  at: string;
  actorId: string | null;
  ref: Record<string, unknown>;
};

// GET /companies/{companyId}/history?quarter_id&cursor&limit
// responses + sent_messages + jobs를 합쳐 시간순 파생 타임라인으로 구성한다.
export const GET = withApiHandler<{ companyId: string }>(async (req, { params }) => {
  const { searchParams } = new URL(req.url);
  const quarterId = searchParams.get("quarterId");
  const limit = parseLimit(searchParams);

  const outreach = await prisma.outreach.findUnique({
    where: { companyId: params.companyId },
    select: { id: true },
  });
  if (!outreach) throw new ApiError("NOT_FOUND", "기업의 컨택 건을 찾을 수 없습니다.");

  const [sends, responses, jobs] = await Promise.all([
    prisma.sentMessage.findMany({
      where: { outreachId: outreach.id, ...(quarterId ? { quarterId } : {}) },
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

  // 세 출처를 합쳐 만든 파생 목록이라 커서를 발급하지 않는다(기존과 동일).
  return {
    body: listBody(events.slice(0, limit), null),
  };
});
