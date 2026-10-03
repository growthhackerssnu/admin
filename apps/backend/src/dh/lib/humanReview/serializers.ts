import type { Prisma } from "@/generated/prisma";

export const reviewCandidateInclude = {
  company: { select: { id: true, name: true, websiteUrl: true } },
  reviewOwner: { select: { id: true, displayName: true } },
  originCollectedCompany: {
    include: { item: { include: { source: { select: { id: true, name: true } } } } },
  },
  selectedContact: { select: { id: true, name: true, title: true } },
  selectedEndpoint: { select: { id: true, channel: true, address: true } },
  activeReviewDecision: { include: { decidedBy: { select: { id: true, displayName: true } } } },
  outreaches: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 },
  tasks: {
    where: { pipeline: "human_review", type: "company_research", status: "failed" },
    select: { errorCode: true, errorMessage: true, errorRetryable: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} as const satisfies Prisma.CandidateInclude;

export type ReviewCandidateRow = Prisma.CandidateGetPayload<{
  include: typeof reviewCandidateInclude;
}>;

export function serializeReviewDecision(row: NonNullable<ReviewCandidateRow["activeReviewDecision"]>) {
  return {
    id: row.id,
    candidateId: row.candidateId,
    action: row.action,
    fit: row.fit,
    contactResult: row.contactResult,
    researchId: row.researchId,
    contactId: row.contactId,
    endpointId: row.endpointId,
    note: row.note,
    decidedBy: { id: row.decidedBy.id, name: row.decidedBy.displayName },
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeReviewCandidate(row: ReviewCandidateRow, viewerId: string) {
  const origin = row.originCollectedCompany;
  const failed = row.tasks[0];
  return {
    id: row.id,
    revision: row.revision,
    company: {
      id: row.company.id,
      name: row.company.name,
      summary: origin?.summary ?? null,
      websiteUrl: row.company.websiteUrl,
    },
    discovery: {
      sourceId: origin?.item.source.id ?? null,
      sourceName: origin?.item.source.name ?? null,
      url: origin?.item.url ?? null,
      collectedAt: (origin?.item.extractedAt ?? origin?.item.publishedAt ?? row.createdAt).toISOString(),
    },
    researchStatus: row.researchStatus,
    reviewStatus: row.reviewStatus,
    owner: row.reviewOwner
      ? { id: row.reviewOwner.id, name: row.reviewOwner.displayName }
      : null,
    selectedRecipient: row.selectedContact && row.selectedEndpoint
      ? {
          contactId: row.selectedContact.id,
          endpointId: row.selectedEndpoint.id,
          name: row.selectedContact.name,
          title: row.selectedContact.title,
          channel: row.selectedEndpoint.channel,
          address: row.selectedEndpoint.address,
        }
      : null,
    outreachId: row.outreaches[0]?.id ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    error: failed && row.researchStatus === "error"
      ? {
          code: failed.errorCode ?? "RESEARCH_FAILED",
          message: failed.errorMessage ?? "조사에 실패했습니다.",
          retryable: failed.errorRetryable ?? false,
        }
      : null,
    canEdit: row.reviewOwnerId === viewerId,
  };
}
