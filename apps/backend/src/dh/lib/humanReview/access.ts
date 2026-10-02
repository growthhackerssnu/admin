import type { Member, Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";

export function requireExternalReader(member: Member) {
  if (
    member.role !== "admin" &&
    (member.role !== "acting" ||
      (member.opsRole !== "external_lead" && member.opsRole !== "external_member"))
  ) throw new ApiError("FORBIDDEN", "대외협력 업무 접근 권한이 없습니다.");
}

export function requireExternalLead(member: Member) {
  if (member.role !== "admin" && (member.role !== "acting" || member.opsRole !== "external_lead"))
    throw new ApiError("FORBIDDEN", "대외협력 팀장 권한이 필요합니다.");
}

export function requireReviewOwner(member: Member, ownerId: string | null) {
  requireExternalReader(member);
  if (!ownerId || ownerId !== member.id)
    throw new ApiError("OWNER_CONFLICT", "배정 담당자만 이 후보를 수정할 수 있습니다.");
}

export const assignableCandidateWhere: Prisma.CandidateWhereInput = {
  researchStatus: "ready",
  reviewStatus: "unreviewed",
  reviewOwnerId: null,
  company: { outreaches: { none: {} }, pastProjects: { none: {} } },
};
