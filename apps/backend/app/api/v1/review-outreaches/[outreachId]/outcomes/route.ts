import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead, requireExternalReader } from "@/dh/lib/humanReview/access";
import { assertManualTransition, serializeOutcomeEvent, transitionOutcome } from "@/dh/lib/humanReview/outcome";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const outcomeInput = z.object({
  expectedVersion: z.number().int().positive(),
  result: z.enum(["won", "rejected"]),
  note: z.string().max(2000).optional(),
}).strict();

// 사람이 수주 완료·거절을 기록한다. 담당자 또는 팀장·관리자만 가능하고, 종료된 회차의
// 결과 정정도 근거(note)를 남기면 허용한다. 프로젝트 완료 행은 만들지 않는다.
export const POST = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = outcomeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "수주 결과 요청이 올바르지 않습니다.");
  requireExternalReader(member);
  const owner = await prisma.outreach.findUnique({ where: { id: params.outreachId }, select: { ownerId: true } });
  if (!owner) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  if (owner.ownerId !== member.id) requireExternalLead(member);
  const input = parsed.data;
  return withIdempotency(req, member, `/review-outreaches/${params.outreachId}/outcomes`, input, async (tx) => {
    const outreach = await tx.outreach.findUniqueOrThrow({
      where: { id: params.outreachId },
      select: { id: true, version: true, sendStatus: true, outcomeStatus: true },
    });
    if (outreach.version !== input.expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
    if (outreach.sendStatus !== "sent")
      throw new ApiError("STATE_CONFLICT", "발송된 작업의 결과만 기록할 수 있습니다.");
    assertManualTransition(outreach.outcomeStatus, input.result, input.note);
    const event = await transitionOutcome(tx, {
      outreachId: outreach.id,
      expectedVersion: input.expectedVersion,
      from: outreach.outcomeStatus,
      to: input.result,
      source: "manual",
      actorId: member.id,
      note: input.note,
    });
    return {
      status: 201,
      body: {
        data: {
          outreachId: outreach.id,
          version: input.expectedVersion + 1,
          outcomeStatus: input.result,
          event: serializeOutcomeEvent(event),
        },
      },
    };
  });
});
