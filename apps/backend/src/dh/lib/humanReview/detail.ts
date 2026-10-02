import type { Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";
import {
  reviewCandidateInclude,
  serializeReviewCandidate,
  serializeReviewDecision,
} from "./serializers";

export async function getReviewCandidateDetail(
  tx: Prisma.TransactionClient,
  candidateId: string,
  viewerId: string,
) {
  const row = await tx.candidate.findUnique({
    where: { id: candidateId },
    include: {
      ...reviewCandidateInclude,
      currentResearch: { include: { claims: true } },
    },
  });
  if (!row || !row.originCollectedCompanyId)
    throw new ApiError("NOT_FOUND", "검토 후보를 찾지 못했습니다.");
  const ids = [...new Set(row.currentResearch?.claims.flatMap((claim) => claim.evidenceIds) ?? [])];
  const evidence = ids.length ? await tx.evidence.findMany({
    where: { id: { in: ids }, companyId: row.companyId },
  }) : [];
  return {
    ...serializeReviewCandidate(row, viewerId),
    research: row.currentResearch ? {
      id: row.currentResearch.id,
      createdAt: row.currentResearch.createdAt.toISOString(),
      claims: row.currentResearch.claims.map((claim) => ({
        id: claim.id,
        category: claim.category,
        content: claim.content,
        basis: claim.basis,
        evidenceIds: claim.evidenceIds,
      })),
      evidence: evidence.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        excerpt: item.excerpt,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        retrievedAt: item.retrievedAt.toISOString(),
      })),
      missingInformation: row.currentResearch.missingInformation,
    } : null,
    latestDecision: row.activeReviewDecision
      ? serializeReviewDecision(row.activeReviewDecision)
      : null,
  };
}
