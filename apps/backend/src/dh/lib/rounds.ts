import type { Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";

type Tx = Prisma.TransactionClient;

export const roundInclude = {
  targetQuarter: { select: { id: true, year: true, quarter: true } },
} satisfies Prisma.AcquisitionRoundInclude;

type RoundRow = Prisma.AcquisitionRoundGetPayload<{ include: typeof roundInclude }>;

export function serializeRound(row: RoundRow) {
  return {
    id: row.id,
    targetQuarter: row.targetQuarter,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export function getActiveRound(tx: Tx) {
  return tx.acquisitionRound.findFirst({ where: { endedAt: null }, include: roundInclude });
}

// 클라이언트가 본 회차와 서버의 진행 회차가 같을 때만 통과한다.
export async function requireExpectedRound(tx: Tx, expectedRoundId: string) {
  const active = await getActiveRound(tx);
  if (!active) throw new ApiError("NO_ACTIVE_ROUND", "진행 중인 수주 회차가 없습니다.");
  if (active.id !== expectedRoundId)
    throw new ApiError("ROUND_CHANGED", "수주 회차가 변경됐습니다. 다시 조회하세요.", {
      details: { currentRoundId: active.id },
    });
  return active;
}

// 회차가 없는 과거 작업과 종료된 회차의 작업은 읽기 전용이다.
export function isRoundOpen(outreach: { acquisitionRound: { endedAt: Date | null } | null }) {
  return outreach.acquisitionRound !== null && outreach.acquisitionRound.endedAt === null;
}

export function assertRoundOpen(outreach: { acquisitionRound: { endedAt: Date | null } | null }) {
  if (!isRoundOpen(outreach))
    throw new ApiError("ROUND_CLOSED", "종료됐거나 회차가 없는 작업은 수정할 수 없습니다.");
}
