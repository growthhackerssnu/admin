import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { ApiError } from "@/dh/lib/errors";
import { encodeCursor, parseCursor, parseLimit, takeWithLookahead } from "@/dh/lib/pagination";
import { projectOrderBy, serializeProject } from "@/dh/lib/projects";
import { roundInclude, serializeRound } from "@/dh/lib/rounds";
import { prisma } from "@/lib/prisma";

// 기업의 프로젝트(최신순)와 수주는 확정됐지만 아직 프로젝트가 입력되지 않은 수주 작업을 함께 돌려준다.
// 프로젝트 건수는 프로젝트 행 수이고 완료 횟수가 아니다.
export const GET = withListupApiHandler<{ companyId: string }>(async (req, { member, params }) => {
  requireExternalReader(member);
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const company = await prisma.company.findUnique({ where: { id: params.companyId }, select: { id: true } });
  if (!company) throw new ApiError("NOT_FOUND", "기업을 찾지 못했습니다.");

  const [rows, won] = await Promise.all([
    prisma.pastProject.findMany({
      where: { companyId: company.id },
      orderBy: projectOrderBy,
      take: takeWithLookahead(limit),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.outreach.findMany({
      where: { companyId: company.id, outcomeStatus: "won", sourcedProject: null },
      select: { id: true, version: true, acquisitionRound: { include: roundInclude } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  const hasMore = rows.length > limit;
  const projects = hasMore ? rows.slice(0, limit) : rows;
  const last = projects[projects.length - 1];
  return {
    body: {
      data: {
        projects: projects.map(serializeProject),
        wonWithoutProject: won.map((outreach) => ({
          outreachId: outreach.id,
          version: outreach.version,
          round: outreach.acquisitionRound ? serializeRound(outreach.acquisitionRound) : null,
        })),
        page: { nextCursor: hasMore && last ? encodeCursor(last.id) : null, hasMore },
      },
    },
  };
});
