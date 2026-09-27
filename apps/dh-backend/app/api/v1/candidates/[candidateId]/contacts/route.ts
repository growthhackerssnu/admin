import type { CandidateContactStatus, Channel, Prisma } from "@/generated/prisma";
import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError } from "@/lib/errors";
import { listBody } from "@/lib/listup/errors";
import {
  serializeContactEndpoint,
  serializeContactOptionAssessment,
  serializeContactPerson,
  serializeEvidence,
} from "@/lib/listup/serializers";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const OPTION_STATUSES: CandidateContactStatus[] = ["usable", "needs_verification", "unusable"];
const CHANNEL_TYPES: Channel[] = ["email", "linkedin"];

// GET /candidates/{id}/contacts?type=email|linkedin&status=...&cursor=&limit=
//
// 연락 선택지 평가와 그 근거를 함께 돌려준다(v0.4 §6.7). `usable`은 실제 수신·답장이
// 아니라 "공개 정보나 사람의 확인상 쓸 수 있다"는 평가다. 자동 채널 선택은 없다 —
// 수신자와 채널은 사람이 고른다(P-09).
export const GET = withListupApiHandler<{ candidateId: string }>(async (req, { params }) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const status = searchParams.get("status");
  const type = searchParams.get("type");

  if (status && !OPTION_STATUSES.includes(status as CandidateContactStatus)) {
    throw new ApiError("VALIDATION_ERROR", "status 값이 올바르지 않습니다.", {
      fieldErrors: { status: "허용되지 않는 값" },
    });
  }
  if (type && !CHANNEL_TYPES.includes(type as Channel)) {
    throw new ApiError("VALIDATION_ERROR", "type 값이 올바르지 않습니다.", {
      fieldErrors: { type: "허용되지 않는 값" },
    });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: { id: true },
  });
  if (!candidate) throw new ApiError("NOT_FOUND", "조사 기록을 찾을 수 없습니다.");

  const where: Prisma.ContactOptionAssessmentWhereInput = {
    candidateId: candidate.id,
    ...(status ? { status: status as CandidateContactStatus } : {}),
    ...(type ? { endpoint: { channel: type as Channel } } : {}),
  };

  const rows = await prisma.contactOptionAssessment.findMany({
    where,
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    include: {
      endpoint: { include: { contact: true } },
      confirmedBy: { select: { id: true, displayName: true } },
    },
  });

  const { items, nextCursor, hasMore } = buildPage(rows, limit);

  const evidenceIds = new Set<string>();
  for (const item of items) {
    for (const id of item.endpoint.evidenceIds) evidenceIds.add(id);
    for (const id of item.endpoint.contact?.evidenceIds ?? []) evidenceIds.add(id);
  }
  const evidenceRows = evidenceIds.size
    ? await prisma.evidence.findMany({ where: { id: { in: [...evidenceIds] } } })
    : [];
  const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));

  return {
    body: listBody(
      items.map((item) => {
        const ids = new Set([
          ...item.endpoint.evidenceIds,
          ...(item.endpoint.contact?.evidenceIds ?? []),
        ]);
        return {
          evaluation: serializeContactOptionAssessment(item),
          endpoint: serializeContactEndpoint(item.endpoint),
          // 공용 창구(팀·대표 메일)는 사람이 없다(P-10).
          person: item.endpoint.contact ? serializeContactPerson(item.endpoint.contact) : null,
          evidence: [...ids]
            .map((id) => evidenceById.get(id))
            .filter((e): e is NonNullable<typeof e> => Boolean(e))
            .map(serializeEvidence),
        };
      }),
      { nextCursor, hasMore },
    ),
  };
});
