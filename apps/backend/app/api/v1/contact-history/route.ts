import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { buildCurrentWork } from "@/dh/lib/humanReview/currentWork";
import { ApiError } from "@/dh/lib/errors";
import { decodeSortCursor, encodeSortCursor, parseLimit } from "@/dh/lib/pagination";
import { getActiveRound, serializeRound } from "@/dh/lib/rounds";
import { prisma } from "@/lib/prisma";

const queryInput = z.object({
  query: z.string().trim().max(200).optional(),
  targetQuarterId: z.string().min(1).optional(),
  outcome: z.enum(["pending", "rejected", "unresolved", "unrecorded"]).optional(),
  previousOwnerId: z.string().min(1).optional(),
  currentWork: z.enum(["all", "none", "mine", "others", "sent"]).default("all"),
  sort: z.enum(["lastSentAt_desc", "lastSentAt_asc", "name_asc"]).default("lastSentAt_desc"),
});
const sentCursor = z.object({ k: z.string().datetime(), id: z.string().min(1) });
const nameCursor = z.object({ k: z.string(), id: z.string().min(1) });

type Row = {
  company_id: string;
  name: string;
  description: string | null;
  last_sent_at: Date;
  prev_outreach_id: string | null;
  prev_sent_at: Date | null;
  prev_quarter_id: string | null;
  prev_owner_id: string | null;
  prev_outcome: string | null;
  cur_id: string | null;
};

// 연락 이력: 발송 이력이 있고 수주 완료·프로젝트 이력이 없는 기업을 기업당 한 행으로 돌려준다.
// previousContact는 현재 회차를 제외한 가장 최근 발송 작업이고 currentWork는 현재 회차 작업이다.
// 필터·정렬·커서를 SQL에서 적용한 뒤 페이지를 자른다.
export const GET = withListupApiHandler(async (req, { member }) => {
  requireExternalReader(member);
  const { searchParams } = new URL(req.url);
  const parsed = queryInput.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "조회 조건이 올바르지 않습니다.");
  const q = parsed.data;
  const limit = parseLimit(searchParams);
  const cursorRaw = searchParams.get("cursor");

  const round = await getActiveRound(prisma);
  const roundId = round?.id ?? null;

  const where: Prisma.Sql[] = [
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "dh"."outreaches" w WHERE w.company_id = c.id AND w.outcome_status = 'won')`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "dh"."past_projects" pp WHERE pp.company_id = c.id)`,
  ];
  if (q.query) {
    const like = `%${q.query.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(Prisma.sql`(c.name ILIKE ${like} OR c.product ILIKE ${like})`);
  }
  if (q.targetQuarterId) where.push(Prisma.sql`p.target_quarter_id = ${q.targetQuarterId}`);
  if (q.outcome === "unrecorded") where.push(Prisma.sql`(p.outreach_id IS NOT NULL AND p.outcome_status IS NULL)`);
  else if (q.outcome) where.push(Prisma.sql`p.outcome_status = ${q.outcome}::"dh"."OutcomeStatus"`);
  if (q.previousOwnerId) where.push(Prisma.sql`p.owner_id = ${q.previousOwnerId}`);
  if (q.currentWork === "none") where.push(Prisma.sql`cur.id IS NULL`);
  if (q.currentWork === "mine") where.push(Prisma.sql`cur.owner_id = ${member.id}`);
  if (q.currentWork === "others") where.push(Prisma.sql`(cur.id IS NOT NULL AND cur.owner_id <> ${member.id})`);
  if (q.currentWork === "sent") where.push(Prisma.sql`cur.send_status = 'sent'`);

  let orderBy: Prisma.Sql;
  if (q.sort === "name_asc") {
    orderBy = Prisma.sql`c.name ASC, c.id ASC`;
    if (cursorRaw) {
      const cursor = decodeSortCursor(cursorRaw, nameCursor);
      where.push(Prisma.sql`(c.name, c.id) > (${cursor.k}, ${cursor.id})`);
    }
  } else {
    const desc = q.sort === "lastSentAt_desc";
    orderBy = desc ? Prisma.sql`ls.sent_at DESC, c.id DESC` : Prisma.sql`ls.sent_at ASC, c.id ASC`;
    if (cursorRaw) {
      const cursor = decodeSortCursor(cursorRaw, sentCursor);
      where.push(desc
        ? Prisma.sql`(ls.sent_at, c.id) < (${cursor.k}::timestamp, ${cursor.id})`
        : Prisma.sql`(ls.sent_at, c.id) > (${cursor.k}::timestamp, ${cursor.id})`);
    }
  }

  // 회차가 없으면 모든 발송이 "이전 연락"이고 현재 작업은 없다.
  const notCurrent = roundId ? Prisma.sql`o.acquisition_round_id IS DISTINCT FROM ${roundId}` : Prisma.sql`TRUE`;
  const currentJoin = roundId ? Prisma.sql`cur.acquisition_round_id = ${roundId}` : Prisma.sql`FALSE`;
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH prev AS (
      SELECT DISTINCT ON (o.company_id)
        o.company_id, o.id AS outreach_id, s.sent_at, s.target_quarter_id, o.owner_id, o.outcome_status
      FROM "dh"."outreaches" o
      JOIN "dh"."sent_messages" s ON s.outreach_id = o.id
      WHERE ${notCurrent}
      ORDER BY o.company_id, s.sent_at DESC, s.id DESC
    ), last_sent AS (
      SELECT o.company_id, MAX(s.sent_at) AS sent_at
      FROM "dh"."outreaches" o
      JOIN "dh"."sent_messages" s ON s.outreach_id = o.id
      GROUP BY o.company_id
    )
    SELECT c.id AS company_id, c.name, c.product AS description, ls.sent_at AS last_sent_at,
           p.outreach_id AS prev_outreach_id, p.sent_at AS prev_sent_at, p.target_quarter_id AS prev_quarter_id,
           p.owner_id AS prev_owner_id, p.outcome_status::text AS prev_outcome, cur.id AS cur_id
    FROM "dh"."companies" c
    JOIN last_sent ls ON ls.company_id = c.id
    LEFT JOIN prev p ON p.company_id = c.id
    LEFT JOIN "dh"."outreaches" cur ON cur.company_id = c.id AND ${currentJoin}
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1}`);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const [owners, works] = await Promise.all([
    prisma.member.findMany({
      where: { id: { in: page.flatMap((row) => (row.prev_owner_id ? [row.prev_owner_id] : [])) } },
      select: { id: true, displayName: true },
    }),
    prisma.outreach.findMany({
      where: { id: { in: page.flatMap((row) => (row.cur_id ? [row.cur_id] : [])) } },
      include: {
        owner: { select: { id: true, displayName: true } },
        acquisitionRound: { select: { endedAt: true } },
      },
    }),
  ]);
  const ownerName = new Map(owners.map((owner) => [owner.id, owner.displayName]));
  const workById = new Map(works.map((work) => [work.id, work]));

  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeSortCursor({ k: q.sort === "name_asc" ? last.name : last.last_sent_at.toISOString(), id: last.company_id })
    : null;
  return {
    body: {
      data: page.map((row) => {
        const work = row.cur_id ? workById.get(row.cur_id) : undefined;
        return {
          company: { id: row.company_id, name: row.name, description: row.description },
          previousContact: row.prev_outreach_id && row.prev_sent_at && row.prev_quarter_id && row.prev_owner_id
            ? {
                outreachId: row.prev_outreach_id,
                lastSentAt: row.prev_sent_at.toISOString(),
                targetQuarterId: row.prev_quarter_id,
                owner: { id: row.prev_owner_id, name: ownerName.get(row.prev_owner_id) ?? "" },
                outcomeStatus: row.prev_outcome,
              }
            : null,
          currentWork: work
            ? buildCurrentWork({ ...work, sendStatus: work.sendStatus ?? "before_send" }, member.id)
            : null,
        };
      }),
      page: { nextCursor, hasMore },
      currentRound: round ? serializeRound(round) : null,
    },
  };
});
