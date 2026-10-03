import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { buildCurrentWork } from "@/dh/lib/humanReview/currentWork";
import { ApiError } from "@/dh/lib/errors";
import { decodeSortCursor, encodeSortCursor, parseLimit } from "@/dh/lib/pagination";
import { serializeProject } from "@/dh/lib/projects";
import { getActiveRound, roundInclude, serializeRound } from "@/dh/lib/rounds";
import { prisma } from "@/lib/prisma";

const queryInput = z.object({
  query: z.string().trim().max(200).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  status: z.enum(["won", "in_progress", "completed", "unknown", "won_only"]).optional(),
  ownerId: z.string().min(1).optional(),
});
const cursorShape = z.object({ k: z.number().int(), id: z.string().min(1) });

type Row = {
  company_id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  project_count: number | null;
  won_without_project: number | null;
  won_round_id: string | null;
  sort_ym: number;
  cur_id: string | null;
};

// 협업 이력: 프로젝트가 있거나 수주 완료 기록이 있는 기업을 기업당 한 행으로 돌려준다.
// 정렬은 최신 프로젝트 분기와 수주 분기 중 더 늦은 값의 내림차순이고 companyId로 동률을 가른다.
// 프로젝트가 아직 입력되지 않은 수주 기업은 프로젝트 건수 0으로 나오며 완료로 추정하지 않는다.
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

  const where: Prisma.Sql[] = [Prisma.sql`(COALESCE(pc.cnt, 0) > 0 OR COALESCE(won.won_count, 0) > 0)`];
  if (q.query) {
    const like = `%${q.query.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(Prisma.sql`(c.name ILIKE ${like} OR c.product ILIKE ${like})`);
  }
  if (q.year !== undefined || q.quarter !== undefined) {
    const projectYear = q.year !== undefined ? Prisma.sql`AND pp.year = ${q.year}` : Prisma.empty;
    const projectQuarter = q.quarter !== undefined ? Prisma.sql`AND pp.quarter = ${q.quarter}` : Prisma.empty;
    const wonYear = q.year !== undefined ? Prisma.sql`AND tq.year = ${q.year}` : Prisma.empty;
    const wonQuarter = q.quarter !== undefined ? Prisma.sql`AND tq.quarter = ${q.quarter}` : Prisma.empty;
    where.push(Prisma.sql`(
      EXISTS (SELECT 1 FROM "dh"."past_projects" pp WHERE pp.company_id = c.id ${projectYear} ${projectQuarter})
      OR EXISTS (
        SELECT 1 FROM "dh"."outreaches" wo
        JOIN "dh"."acquisition_rounds" wr ON wr.id = wo.acquisition_round_id
        JOIN "dh"."target_quarters" tq ON tq.id = wr.target_quarter_id
        WHERE wo.company_id = c.id AND wo.outcome_status = 'won' ${wonYear} ${wonQuarter})
    )`);
  }
  // status는 최신 프로젝트의 상태에 적용한다. unknown은 상태가 확인되지 않은 최신 프로젝트,
  // won_only는 프로젝트가 하나도 없는 수주 확정 기업이다.
  if (q.status === "unknown") where.push(Prisma.sql`(proj.project_id IS NOT NULL AND proj.status IS NULL)`);
  else if (q.status === "won_only") where.push(Prisma.sql`(COALESCE(pc.cnt, 0) = 0 AND COALESCE(won.won_count, 0) > 0)`);
  else if (q.status) where.push(Prisma.sql`proj.status = ${q.status}`);
  if (q.ownerId)
    where.push(Prisma.sql`EXISTS (SELECT 1 FROM "dh"."past_projects" po WHERE po.company_id = c.id AND po.owner_id = ${q.ownerId})`);
  if (cursorRaw) {
    const cursor = decodeSortCursor(cursorRaw, cursorShape);
    where.push(Prisma.sql`(COALESCE(GREATEST(proj.year * 10 + proj.quarter, won.ym), 0), c.id) < (${cursor.k}, ${cursor.id})`);
  }

  const currentJoin = roundId ? Prisma.sql`cur.acquisition_round_id = ${roundId}` : Prisma.sql`FALSE`;
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH proj AS (
      SELECT DISTINCT ON (company_id) company_id, id AS project_id, status::text AS status, year, quarter
      FROM "dh"."past_projects"
      ORDER BY company_id, year DESC NULLS LAST, quarter DESC NULLS LAST, created_at DESC, id DESC
    ), pc AS (
      SELECT company_id, COUNT(*)::int AS cnt FROM "dh"."past_projects" GROUP BY company_id
    ), won AS (
      SELECT o.company_id,
             COUNT(*)::int AS won_count,
             COUNT(*) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM "dh"."past_projects" sp WHERE sp.source_outreach_id = o.id))::int AS without_project,
             MAX(tq.year * 10 + tq.quarter) AS ym
      FROM "dh"."outreaches" o
      LEFT JOIN "dh"."acquisition_rounds" r ON r.id = o.acquisition_round_id
      LEFT JOIN "dh"."target_quarters" tq ON tq.id = r.target_quarter_id
      WHERE o.outcome_status = 'won'
      GROUP BY o.company_id
    ), won_latest AS (
      SELECT DISTINCT ON (o.company_id) o.company_id, o.acquisition_round_id AS round_id
      FROM "dh"."outreaches" o
      LEFT JOIN "dh"."acquisition_rounds" r ON r.id = o.acquisition_round_id
      WHERE o.outcome_status = 'won'
      ORDER BY o.company_id, r.started_at DESC NULLS LAST, o.id DESC
    )
    SELECT c.id AS company_id, c.name, c.product AS description,
           proj.project_id, COALESCE(pc.cnt, 0) AS project_count,
           COALESCE(won.without_project, 0) AS won_without_project,
           won_latest.round_id AS won_round_id,
           COALESCE(GREATEST(proj.year * 10 + proj.quarter, won.ym), 0)::int AS sort_ym,
           cur.id AS cur_id
    FROM "dh"."companies" c
    LEFT JOIN proj ON proj.company_id = c.id
    LEFT JOIN pc ON pc.company_id = c.id
    LEFT JOIN won ON won.company_id = c.id
    LEFT JOIN won_latest ON won_latest.company_id = c.id
    LEFT JOIN "dh"."outreaches" cur ON cur.company_id = c.id AND ${currentJoin}
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY sort_ym DESC, c.id DESC
    LIMIT ${limit + 1}`);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const [projects, rounds, works] = await Promise.all([
    prisma.pastProject.findMany({ where: { id: { in: page.flatMap((row) => (row.project_id ? [row.project_id] : [])) } } }),
    prisma.acquisitionRound.findMany({
      where: { id: { in: page.flatMap((row) => (row.won_round_id ? [row.won_round_id] : [])) } },
      include: roundInclude,
    }),
    prisma.outreach.findMany({
      where: { id: { in: page.flatMap((row) => (row.cur_id ? [row.cur_id] : [])) } },
      include: {
        owner: { select: { id: true, displayName: true } },
        acquisitionRound: { select: { endedAt: true } },
      },
    }),
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const roundById = new Map(rounds.map((item) => [item.id, item]));
  const workById = new Map(works.map((work) => [work.id, work]));

  const last = page[page.length - 1];
  return {
    body: {
      data: page.map((row) => {
        const project = row.project_id ? projectById.get(row.project_id) : undefined;
        const wonRound = row.won_round_id ? roundById.get(row.won_round_id) : undefined;
        const work = row.cur_id ? workById.get(row.cur_id) : undefined;
        return {
          company: { id: row.company_id, name: row.name, description: row.description },
          latestProject: project ? serializeProject(project) : null,
          projectCount: row.project_count ?? 0,
          wonWithoutProjectCount: row.won_without_project ?? 0,
          latestWonRound: wonRound ? serializeRound(wonRound) : null,
          currentWork: work
            ? buildCurrentWork({ ...work, sendStatus: work.sendStatus ?? "before_send" }, member.id)
            : null,
        };
      }),
      page: {
        nextCursor: hasMore && last ? encodeSortCursor({ k: last.sort_ym, id: last.company_id }) : null,
        hasMore,
      },
    },
  };
});
