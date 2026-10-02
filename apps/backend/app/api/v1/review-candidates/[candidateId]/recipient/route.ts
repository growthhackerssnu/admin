import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getReviewCandidateDetail } from "@/dh/lib/humanReview/detail";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const recipientInput = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().max(200).optional(),
  channel: z.enum(["linkedin", "email"]),
  address: z.string().trim().min(1).max(1000),
}).strict();

function validAddress(channel: "linkedin" | "email", address: string) {
  if (channel === "email") return z.string().email().safeParse(address).success;
  try {
    const url = new URL(address);
    return url.protocol === "https:" &&
      (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com")) &&
      /^\/in\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

export const PUT = withListupApiHandler<{ candidateId: string }>(async (req, { member, params }) => {
  const parsed = recipientInput.safeParse(await req.json());
  if (!parsed.success || !validAddress(parsed.data.channel, parsed.data.address))
    throw new ApiError("VALIDATION_ERROR", "관계자 이름 또는 연락 주소가 올바르지 않습니다.");
  const current = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { reviewOwnerId: true, originCollectedCompanyId: true },
  });
  if (!current?.originCollectedCompanyId) throw new ApiError("NOT_FOUND", "검토 후보를 찾지 못했습니다.");
  requireReviewOwner(member, current.reviewOwnerId);

  const input = parsed.data;
  return withIdempotency(req, member, `/review-candidates/${params.candidateId}/recipient`, input, async (tx) => {
    const candidate = await tx.candidate.findUniqueOrThrow({
      where: { id: params.candidateId },
      select: { companyId: true },
    });
    const changed = await tx.candidate.updateMany({
      where: {
        id: params.candidateId,
        reviewOwnerId: member.id,
        revision: input.expectedRevision,
        researchStatus: "ready",
        reviewStatus: { in: ["unreviewed", "reviewing"] },
      },
      data: { reviewStatus: "reviewing", revision: { increment: 1 } },
    });
    if (!changed.count)
      throw new ApiError("REVISION_CONFLICT", "후보 상태가 바뀌었습니다. 새로고침 후 다시 입력하세요.");

    const address = input.channel === "email" ? input.address.toLowerCase() : input.address;
    let endpoint = await tx.contactEndpoint.findUnique({
      where: { companyId_channel_address: { companyId: candidate.companyId, channel: input.channel, address } },
      include: { contact: true },
    });
    let contactId: string;
    if (endpoint?.contact) {
      if (endpoint.contact.name !== input.name || (endpoint.contact.title ?? "") !== (input.title ?? ""))
        throw new ApiError("STATE_CONFLICT", "같은 연락 주소가 다른 관계자 정보에 연결되어 있습니다.");
      contactId = endpoint.contact.id;
    } else {
      const contact = await tx.contact.create({
        data: { companyId: candidate.companyId, name: input.name, title: input.title ?? null },
      });
      contactId = contact.id;
    }
    if (!endpoint) {
      endpoint = await tx.contactEndpoint.create({
        data: {
          companyId: candidate.companyId,
          contactId,
          channel: input.channel,
          address,
          ownerType: "person",
          discoveryMethod: "user_provided",
          ownershipStatus: "supported",
          validationStatus: "valid_format",
          reachabilityStatus: "unknown",
          linkedinMethods: [],
          checkedAt: new Date(),
        },
        include: { contact: true },
      });
    } else if (!endpoint.contactId) {
      endpoint = await tx.contactEndpoint.update({
        where: { id: endpoint.id },
        data: { contactId },
        include: { contact: true },
      });
    }
    await tx.candidate.update({
      where: { id: params.candidateId },
      data: { selectedContactId: contactId, selectedEndpointId: endpoint.id },
    });
    return {
      status: 200,
      body: { data: await getReviewCandidateDetail(tx, params.candidateId, member.id) },
    };
  });
});
