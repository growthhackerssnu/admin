import type { CandidateContactStatus, Channel, ContactPriority, Prisma } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, listBody } from "@/lib/errors";
import {
  serializeCandidateContact,
  serializeCompanyPerson,
  serializeContactChannel,
  serializeEvidence,
} from "@/lib/listup/serializers";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const CONTACT_STATUSES: CandidateContactStatus[] = ["usable", "needs_verification", "unusable"];
const PRIORITIES: ContactPriority[] = ["preferred", "alternative"];
const CHANNEL_TYPES: Channel[] = ["email", "linkedin"];

// GET /candidates/{id}/contacts?status&type&priority&cursor&limit
// 정렬은 preferred 우선 → checked_at 내림차순 → id 내림차순.
export const GET = withApiHandler<{ candidateId: string }>(async (req, { params }) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const priority = searchParams.get("priority");

  if (status && !CONTACT_STATUSES.includes(status as CandidateContactStatus)) {
    throw new ApiError("VALIDATION_ERROR", "status 값이 올바르지 않습니다.", { fieldErrors: { status: "허용되지 않는 값" } });
  }
  if (type && !CHANNEL_TYPES.includes(type as Channel)) {
    throw new ApiError("VALIDATION_ERROR", "type 값이 올바르지 않습니다.", { fieldErrors: { type: "허용되지 않는 값" } });
  }
  if (priority && !PRIORITIES.includes(priority as ContactPriority)) {
    throw new ApiError("VALIDATION_ERROR", "priority 값이 올바르지 않습니다.", { fieldErrors: { priority: "허용되지 않는 값" } });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { id: true },
  });
  if (!candidate) throw new ApiError("NOT_FOUND", "후보를 찾을 수 없습니다.");

  const where: Prisma.CandidateContactWhereInput = {
    candidateId: candidate.id,
    ...(status ? { status: status as CandidateContactStatus } : {}),
    ...(priority ? { priority: priority as ContactPriority } : {}),
    ...(type ? { contactChannel: { type: type as Channel } } : {}),
  };

  const rows = await prisma.candidateContact.findMany({
    where,
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ priority: "asc" }, { checkedAt: "desc" }, { id: "desc" }],
    include: { contactChannel: { include: { person: true } } },
  });

  const { items, nextCursor } = buildPage(rows, limit);

  const evidenceIds = new Set<string>();
  for (const item of items) {
    for (const id of item.contactChannel.evidenceIds) evidenceIds.add(id);
    for (const id of item.contactChannel.person?.employmentEvidenceIds ?? []) evidenceIds.add(id);
  }
  const evidenceRows = evidenceIds.size
    ? await prisma.evidence.findMany({ where: { id: { in: [...evidenceIds] } } })
    : [];
  const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));

  return {
    body: listBody(
      items.map((item) => {
        const ids = new Set([
          ...item.contactChannel.evidenceIds,
          ...(item.contactChannel.person?.employmentEvidenceIds ?? []),
        ]);
        return {
          evaluation: serializeCandidateContact(item),
          channel: serializeContactChannel(item.contactChannel),
          person: item.contactChannel.person
            ? serializeCompanyPerson(item.contactChannel.person)
            : null,
          // LinkedIn 연락 방식이 미확인이면 빈 배열 그대로 나간다(명세 §6.5).
          evidence: [...ids]
            .map((id) => evidenceById.get(id))
            .filter((e): e is NonNullable<typeof e> => Boolean(e))
            .map(serializeEvidence),
        };
      }),
      nextCursor,
    ),
  };
});
