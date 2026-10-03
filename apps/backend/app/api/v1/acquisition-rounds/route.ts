import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { getActiveRound, roundInclude, serializeRound } from "@/dh/lib/rounds";
import { ApiError } from "@/dh/lib/errors";

const setInput = z.object({
  targetQuarterId: z.string().min(1),
  expectedActiveRoundId: z.string().min(1).nullable(),
}).strict();

// 팀장·관리자가 목표 분기를 바꾸면 이전 회차 종료, 결과 대기의 미확정 전환, 새 회차 시작이
// 한 트랜잭션으로 일어난다. 기간은 서버 시각으로만 정한다.
export const POST = withListupApiHandler(async (req, { member }) => {
  requireExternalLead(member);
  const parsed = setInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "수주 회차 요청이 올바르지 않습니다.");
  const input = parsed.data;
  return withIdempotency(req, member, "POST /acquisition-rounds", input, async (tx) => {
    // 진행 중 회차 행을 잠가 동시 변경을 직렬화한다.
    await tx.$queryRaw`SELECT id FROM "dh"."acquisition_rounds" WHERE ended_at IS NULL FOR UPDATE`;
    const active = await getActiveRound(tx);
    if (active?.targetQuarterId === input.targetQuarterId)
      return {
        status: 200,
        body: { data: { currentRound: serializeRound(active), closedRoundId: null, unresolvedCount: 0 } },
      };
    if ((active?.id ?? null) !== input.expectedActiveRoundId)
      throw new ApiError("ROUND_CHANGED", "수주 회차가 이미 변경됐습니다. 다시 조회하세요.", {
        details: { currentRoundId: active?.id ?? null },
      });
    const quarter = await tx.targetQuarter.findUnique({ where: { id: input.targetQuarterId } });
    if (!quarter) throw new ApiError("VALIDATION_ERROR", "목표 분기를 찾지 못했습니다.");

    const now = new Date();
    let unresolvedCount = 0;
    if (active) {
      // 발송 후 결과가 기록되지 않은 작업만 미확정으로 바꾼다. 수주 완료·거절과 미발송 작업은
      // 조건에서 빠지므로 덮어쓰지 않는다. RETURNING으로 실제 바뀐 행에만 이력을 남긴다.
      const changed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "dh"."outreaches"
        SET outcome_status = 'unresolved', version = version + 1, updated_at = ${now}
        WHERE acquisition_round_id = ${active.id}
          AND send_status = 'sent'
          AND outcome_status = 'pending'
        RETURNING id`;
      unresolvedCount = changed.length;
      if (changed.length)
        await tx.outreachOutcomeEvent.createMany({
          data: changed.map((row) => ({
            outreachId: row.id,
            fromStatus: "pending" as const,
            toStatus: "unresolved" as const,
            source: "round_close" as const,
            actorId: null,
            recordedAt: now,
          })),
        });
      await tx.acquisitionRound.update({
        where: { id: active.id },
        data: { endedAt: now, closedById: member.id },
      });
    }
    let created;
    try {
      created = await tx.acquisitionRound.create({
        data: { targetQuarterId: quarter.id, startedAt: now, createdById: member.id },
        include: roundInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ApiError("ROUND_CHANGED", "다른 요청이 먼저 회차를 시작했습니다. 다시 조회하세요.");
      throw error;
    }
    return {
      status: 201,
      body: { data: { currentRound: serializeRound(created), closedRoundId: active?.id ?? null, unresolvedCount } },
    };
  }, { maxWait: 10_000, timeout: 15_000 });
});
