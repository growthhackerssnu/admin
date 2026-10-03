import { isRoundOpen } from "@/dh/lib/rounds";

export type BlockReason =
  | "not_owner"
  | "already_sent"
  | "round_closed"
  | "purpose_missing"
  | "recipient_missing"
  | "evidence_missing";

type WorkRow = {
  id: string;
  ownerId: string;
  owner: { id: string; displayName: string };
  sendStatus: "before_send" | "sent";
  outcomeStatus: string | null;
  acquisitionRound: { endedAt: Date | null } | null;
  candidateId: string | null;
  contactPurpose: string | null;
  recipientContactId: string | null;
  recipientEndpointId: string | null;
};

// 현재 회차 작업의 편집·생성 가능 여부. 모든 연락 작업 응답이 같은 규칙을 쓰도록 한 곳에 둔다.
// hasEvidence를 생략하면(목록 조회) 근거 검사는 건너뛴다.
export function buildCurrentWork(row: WorkRow, memberId: string, hasEvidence?: boolean) {
  const blockReasons: BlockReason[] = [];
  if (row.ownerId !== memberId) blockReasons.push("not_owner");
  if (row.sendStatus === "sent") blockReasons.push("already_sent");
  if (!isRoundOpen(row)) blockReasons.push("round_closed");
  const canEdit = blockReasons.length === 0;
  // 재연락·재협업(후보 없는 작업)은 사람이 적은 연락 목적이 있어야 생성할 수 있다.
  if (!row.candidateId && !row.contactPurpose?.trim()) blockReasons.push("purpose_missing");
  if (!row.recipientContactId || !row.recipientEndpointId) blockReasons.push("recipient_missing");
  if (hasEvidence === false) blockReasons.push("evidence_missing");
  return {
    id: row.id,
    owner: { id: row.owner.id, name: row.owner.displayName },
    sendStatus: row.sendStatus,
    canEdit,
    canGenerate: canEdit && blockReasons.length === 0,
    outcomeStatus: row.outcomeStatus,
    blockReasons,
  };
}
