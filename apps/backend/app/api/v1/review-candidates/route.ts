import type { Prisma } from "@/generated/prisma";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { reviewCandidateInclude, serializeReviewCandidate } from "@/dh/lib/humanReview/serializers";
import { ApiError } from "@/dh/lib/errors";
import { buildPage, parseCursor, parseLimit } from "@/dh/lib/pagination";
import { prisma } from "@/lib/prisma";

const researchStatuses = ["queued", "running", "ready", "error"];
const reviewStatuses = ["unreviewed", "reviewing", "approved", "rejected_fit", "rejected_contact"];

export const GET = withListupApiHandler(async (req, { member }) => {
  requireExternalReader(member);
  const params = new URL(req.url).searchParams;
  const limit = parseLimit(params);
  const cursor = parseCursor(params);
  const researchStatus = params.get("researchStatus");
  const reviewStatus = params.get("reviewStatus");
  const ownerId = params.get("ownerId");
  const q = params.get("q")?.trim();
  if (researchStatus && !researchStatuses.includes(researchStatus))
    throw new ApiError("VALIDATION_ERROR", "조사 상태가 올바르지 않습니다.");
  if (reviewStatus && !reviewStatuses.includes(reviewStatus))
    throw new ApiError("VALIDATION_ERROR", "검토 상태가 올바르지 않습니다.");
  const from = params.get("from");
  const to = params.get("to");
  if ([from, to].some((value) => value && Number.isNaN(new Date(value).getTime())))
    throw new ApiError("VALIDATION_ERROR", "수집 기간이 올바르지 않습니다.");
  const where: Prisma.CandidateWhereInput = {
    originCollectedCompanyId: { not: null },
    ...(researchStatus ? { researchStatus: researchStatus as "queued" | "running" | "ready" | "error" } : {}),
    ...(reviewStatus ? { reviewStatus: reviewStatus as "unreviewed" | "reviewing" | "approved" | "rejected_fit" | "rejected_contact" } : {}),
    ...(ownerId ? { reviewOwnerId: ownerId === "me" ? member.id : ownerId } : {}),
    ...(q ? { company: { name: { contains: q, mode: "insensitive" } } } : {}),
    ...(from || to ? {
      originCollectedCompany: { item: { publishedAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(to) } : {}),
      } } },
    } : {}),
  };
  const rows = await prisma.candidate.findMany({
    where,
    include: reviewCandidateInclude,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const page = buildPage(rows, limit);
  return {
    body: {
      data: page.items.map((row) => serializeReviewCandidate(row, member.id)),
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    },
  };
});
