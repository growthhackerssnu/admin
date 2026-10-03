import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { buildCurrentWork } from "@/dh/lib/humanReview/currentWork";
import { serializeOutcomeEvent } from "@/dh/lib/humanReview/outcome";
import { ApiError } from "@/dh/lib/errors";
import { decodeCursor, encodeCursor, parseLimit } from "@/dh/lib/pagination";
import { prisma } from "@/lib/prisma";

type Actor = { id: string; displayName: string } | null;
const actorOf = (member: Actor) => (member ? { id: member.id, name: member.displayName } : null);

// GET /companies/{id}/history — drawer용 기업 정보·관계자·저장 조사 요약과 전 회차 연락 이력.
// 이력은 발송·응답·수주 결과를 최신순으로 합친다. 내부 AI Job은 싣지 않고, 조회 중에는
// 새로 검색하지 않는다.
// ponytail: 한 기업의 이력은 수십 건이라 메모리에서 합쳐 자른다. 수천 건이 되면 UNION 쿼리로 바꾼다.
export const GET = withListupApiHandler<{ companyId: string }>(async (req, { member, params }) => {
  requireExternalReader(member);
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursorRaw = searchParams.get("cursor");
  const cursor = cursorRaw === null ? null : decodeCursor(cursorRaw);
  const roundFilter = searchParams.get("acquisitionRoundId");

  // DB 왕복 한 번이 비싸서(서버↔DB 약 0.6초) 서로 기다릴 필요 없는 조회는 한 번에 보낸다.
  // 기업·이력·조사·현재 작업은 전부 params.companyId만 알면 되므로 한 묶음으로 조회한다.
  const outreachWhere = {
    companyId: params.companyId,
    ...(roundFilter ? { acquisitionRoundId: roundFilter } : {}),
  };
  const [company, outreaches, research, currentRow] = await Promise.all([
    prisma.company.findUnique({
      where: { id: params.companyId },
      select: {
        id: true,
        name: true,
        product: true,
        contacts: {
          orderBy: { createdAt: "asc" },
          include: { endpoints: { where: { contactId: { not: null } }, orderBy: { createdAt: "asc" } } },
        },
      },
    }),
    prisma.outreach.findMany({
      where: outreachWhere,
      select: {
        id: true,
        acquisitionRoundId: true,
        sentMessages: { include: { recordedBy: { select: { id: true, displayName: true } } } },
        responses: { include: { checkedBy: { select: { id: true, displayName: true } } } },
        outcomeEvents: { include: { actor: { select: { id: true, displayName: true } } } },
      },
    }),
    prisma.companyResearch.findFirst({
      where: { companyId: params.companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { claims: { orderBy: { id: "asc" }, take: 6 } },
    }),
    // 진행 중인 회차의 작업. 회차 id를 먼저 조회하지 않고 관계 조건으로 한 번에 찾는다.
    prisma.outreach.findFirst({
      where: { companyId: params.companyId, acquisitionRound: { endedAt: null } },
      include: {
        owner: { select: { id: true, displayName: true } },
        acquisitionRound: { select: { endedAt: true } },
      },
    }),
  ]);
  if (!company) throw new ApiError("NOT_FOUND", "기업을 찾을 수 없습니다.");

  const events = outreaches.flatMap((outreach) => {
    const base = { outreachId: outreach.id, acquisitionRoundId: outreach.acquisitionRoundId };
    return [
      ...outreach.sentMessages.map((sent) => ({
        ...base,
        id: `sent_${sent.id}`,
        type: "sent" as const,
        at: sent.sentAt.toISOString(),
        actor: actorOf(sent.recordedBy),
        sentMessage: {
          id: sent.id,
          outreachId: sent.outreachId,
          targetQuarterId: sent.targetQuarterId,
          channel: sent.channel,
          recipientNameSnapshot: sent.recipientNameSnapshot,
          addressSnapshot: sent.addressSnapshot,
          subjectSnapshot: sent.subjectSnapshot,
          bodySnapshot: sent.bodySnapshot,
          sentAt: sent.sentAt.toISOString(),
          recordedById: sent.recordedById,
        },
      })),
      ...outreach.responses.map((response) => ({
        ...base,
        id: `response_${response.id}`,
        type: "response" as const,
        at: response.checkedAt.toISOString(),
        actor: actorOf(response.checkedBy),
        response: {
          result: response.result,
          explanation: response.explanation,
          revisitCondition: response.revisitCondition,
        },
      })),
      ...outreach.outcomeEvents.map((event) => ({
        ...base,
        id: `outcome_${event.id}`,
        type: "outcome" as const,
        at: event.recordedAt.toISOString(),
        actor: actorOf(event.actor),
        outcome: serializeOutcomeEvent(event),
      })),
    ];
  }).sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));

  let start = 0;
  if (cursor) {
    const index = events.findIndex((event) => event.id === cursor);
    if (index < 0)
      throw new ApiError("VALIDATION_ERROR", "cursor 값이 올바르지 않습니다.", {
        fieldErrors: { cursor: "서버가 발급한 값이 아님" },
      });
    start = index + 1;
  }
  const items = events.slice(start, start + limit);
  const hasMore = start + limit < events.length;
  const last = items[items.length - 1];

  return {
    body: {
      data: {
        company: { id: company.id, name: company.name, description: company.product },
        contacts: company.contacts.flatMap((contact) =>
          contact.endpoints.map((endpoint) => ({
            contactId: contact.id,
            endpointId: endpoint.id,
            name: contact.name,
            title: contact.title,
            channel: endpoint.channel,
            address: endpoint.address,
          })),
        ),
        researchSummary: research?.claims.length ? research.claims.map((claim) => claim.content).join("\n") : null,
        events: items,
        currentWork: currentRow
          ? buildCurrentWork(
              { ...currentRow, sendStatus: currentRow.sendStatus ?? "before_send" },
              member.id,
            )
          : null,
        page: { nextCursor: hasMore && last ? encodeCursor(last.id) : null, hasMore },
      },
    },
  };
});
