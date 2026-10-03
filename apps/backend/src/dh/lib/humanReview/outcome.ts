import type { OutcomeEventSource, OutcomeStatus, Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";

type Tx = Prisma.TransactionClient;

// 사람이 기록할 수 있는 전이. 종료 회차의 결과(unresolved)나 이미 확정된 결과(won/rejected)를
// 바꾸는 정정은 근거(note)가 필수다. 정책이 바뀌면 이 표만 고친다.
const MANUAL_TRANSITIONS: Record<OutcomeStatus, OutcomeStatus[]> = {
  pending: ["won", "rejected"],
  unresolved: ["won", "rejected"],
  won: ["rejected"],
  rejected: ["won"],
};

export function assertManualTransition(from: OutcomeStatus | null, to: OutcomeStatus, note: string | undefined) {
  // 결과가 기록된 적 없는 과거 발송(null)은 pending과 같은 첫 기록으로 본다.
  const allowed = from === null ? MANUAL_TRANSITIONS.pending : MANUAL_TRANSITIONS[from];
  if (!allowed.includes(to))
    throw new ApiError("STATE_CONFLICT", "이 결과로는 변경할 수 없는 상태입니다.", {
      details: { from, to },
    });
  const correcting = from !== null && from !== "pending";
  if (correcting && !note?.trim())
    throw new ApiError("VALIDATION_ERROR", "결과를 정정하려면 근거(note)가 필요합니다.", {
      fieldErrors: { note: "정정 근거 필수" },
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
    source: event.source,
    actorId: event.actorId,
    recordedAt: event.recordedAt.toISOString(),
  };
}
