import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import type { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { readIdempotentResult } from "@/dh/lib/idempotency";
import { generateTemplateDraft } from "@/dh/lib/humanReview/templateGeneration";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;
const generateInput = z.object({
  expectedVersion: z.number().int().positive(),
  // 쓸 메일 양식. 생략하면 이 작업의 기본 양식을 쓴다.
  templateId: z.string().min(1).optional(),
  projectIds: z.array(z.string().min(1)).max(50).optional()
    .refine((ids) => !ids || new Set(ids).size === ids.length, "중복된 projectId가 있습니다."),
}).strict();
type OutreachDetail = Awaited<ReturnType<typeof getHumanOutreachDetail>>;

// 초안은 설정 > 메일 양식의 양식으로 만든다. 고정 문장과 자동 입력은 서버가 조립하고,
// AI는 양식에 표시된 구간만 쓴다(src/dh/lib/humanReview/templateGeneration.ts).
export const POST = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = generateInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "초안 생성 요청이 올바르지 않습니다.");
  const input = parsed.data;
  const route = `/review-outreaches/${params.outreachId}/draft-generation`;
  const outreach = await prisma.outreach.findUnique({
    where: { id: params.outreachId },
    select: { id: true, ownerId: true, version: true, sendStatus: true, sentMessages: { select: { id: true }, take: 1 } },
  });
  if (!outreach) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, outreach.ownerId);
  const replay = await readIdempotentResult<{ data: OutreachDetail }>(req, member, route, input);
  if (replay) return replay;
  if (outreach.version !== input.expectedVersion)
    throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
  if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
    throw new ApiError("STATE_CONFLICT", "이미 발송된 기업의 초안은 다시 만들 수 없습니다.");
  return generateTemplateDraft({ req, member, route, outreachId: outreach.id, input });
});
