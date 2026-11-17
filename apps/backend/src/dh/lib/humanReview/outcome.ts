import type { OutcomeEventSource, OutcomeStatus, Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";

type Tx = Prisma.TransactionClient;

// 사람이 고를 수 있는 상태. 무응답(unresolved)은 수주 회차를 넘길 때만 자동으로 정해진다.
export const MANUAL_OUTCOMES = ["pending", "in_discussion", "won", "rejected"] as const satisfies readonly OutcomeStatus[];

// 사람은 발송된 작업의 상태를 언제든 다른 값으로 바꿀 수 있다. 잘못 누른 기록을 되돌릴 수 있어야 해서
// 확정된 결과(수주·거절·무응답)에서도 막지 않고, 메모도 강제하지 않는다. 바꾼 내역은 이력에 모두 남는다.
export function assertManualTransition(from: OutcomeStatus | null, to: OutcomeStatus) {
  // 결과가 기록된 적 없는 과거 발송(null)은 회신 대기로 본다.
  if (!(MANUAL_OUTCOMES as readonly OutcomeStatus[]).includes(to) || (from ?? "pending") === to)
    throw new ApiError("STATE_CONFLICT", "이 결과로는 변경할 수 없는 상태입니다.", {
      details: { from, to },
    });
}

// 결과 상태 변경과 이력 추가를 한 쌍으로 쓴다. 조건부 갱신이라 회차 종료의 자동 전환과
// 사람의 기록이 동시에 들어와도 먼저 들어온 쪽의 값을 덮어쓰지 않는다.
export async function transitionOutcome(
  tx: Tx,
  input: {
    outreachId: string;
    expectedVersion: number;
    from: OutcomeStatus | null;
    to: OutcomeStatus;
    source: OutcomeEventSource;
    actorId: string | null;
    note?: string;
    revisitCondition?: string;
    versionError?: "VERSION_CONFLICT" | "STATE_CONFLICT";
  },
) {
  const changed = await tx.outreach.updateMany({
    where: {
      id: input.outreachId,
      version: input.expectedVersion,
      outcomeStatus: input.from,
    },
    data: { outcomeStatus: input.to, version: { increment: 1 } },
  });
  if (!changed.count)
    throw new ApiError(input.versionError ?? "VERSION_CONFLICT", "결과가 이미 변경됐습니다. 다시 조회하세요.");
  return tx.outreachOutcomeEvent.create({
    data: {
      outreachId: input.outreachId,
      fromStatus: input.from,
      toStatus: input.to,
      note: input.note?.trim() || null,
      revisitCondition: input.revisitCondition?.trim() || null,
      source: input.source,
      actorId: input.actorId,
    },
  });
}

export function serializeOutcomeEvent(event: {
  id: string;
  outreachId: string;
  fromStatus: OutcomeStatus | null;
  toStatus: OutcomeStatus;
  note: string | null;
  revisitCondition: string | null;
  source: OutcomeEventSource;
  actorId: string | null;
  recordedAt: Date;
}) {
  return {
    id: event.id,
    outreachId: event.outreachId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    note: event.note,
    revisitCondition: event.revisitCondition,
    source: event.source,
    actorId: event.actorId,
    recordedAt: event.recordedAt.toISOString(),
  };
}
