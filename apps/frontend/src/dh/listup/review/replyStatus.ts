import type { WorkspaceTone } from "@/components/ui/workspace-status";

// 발송 뒤 상태. 판정 규칙의 원본은 백엔드 src/dh/lib/humanReview/outcome.ts이고,
// 화면과 샘플 데이터 저장소가 같은 표를 쓰도록 여기에 한 번만 옮겨 둔다.
export type ReplyStatus =
  | "pending"
  | "in_discussion"
  | "won"
  | "rejected"
  | "unresolved";
/** 사람이 고를 수 있는 값. 무응답은 수주 분기를 넘길 때만 자동으로 정해진다. */
export type RecordableReplyStatus = "pending" | "in_discussion" | "won" | "rejected";
const recordable: RecordableReplyStatus[] = ["pending", "in_discussion", "won", "rejected"];

/** 사람이 마지막으로 남긴 기록. */
export interface ReplyRecord {
  status: ReplyStatus;
  note: string | null;
  revisitCondition: string | null;
  recordedAt: string;
  recordedBy: string | null;
}
export interface ReplyRecordInput {
  result: RecordableReplyStatus;
  note?: string;
  revisitCondition?: string;
}

export const replyNoteMax = 2000;
export const revisitConditionMax = 500;

export const replyStatusLabels: Record<ReplyStatus, string> = {
  pending: "회신 대기",
  in_discussion: "논의 중",
  won: "수주",
  rejected: "기업 거절",
  unresolved: "무응답",
};
export const replyStatusTones: Record<ReplyStatus, WorkspaceTone> = {
  pending: "info",
  in_discussion: "info",
  won: "success",
  rejected: "neutral",
  unresolved: "neutral",
};

/** 지금 상태가 아닌 값이면 무엇으로든 바꿀 수 있다. 결과가 기록된 적 없는 과거 발송(null)은 회신 대기로 본다. */
export function allowedReplyTransitions(
  from: ReplyStatus | null,
): RecordableReplyStatus[] {
  return recordable.filter((status) => status !== (from ?? "pending"));
}

/** 메모는 언제나 선택 입력이다. 잘못 누른 기록을 바로 되돌릴 수 있어야 한다. */
export function replyNoteRequired(_from: ReplyStatus | null) {
  return false;
}

/** 다시 연락할 시기·조건은 논의 중과 기업 거절에만 적는다. */
export function revisitConditionApplies(to: RecordableReplyStatus | "") {
  return to === "in_discussion" || to === "rejected";
}

/** 수주와 기업 거절은 확정되는 선택이라 확인을 거친다. */
export function replyNeedsConfirmation(to: RecordableReplyStatus) {
  return to === "won" || to === "rejected";
}

/** 기록할 수 없는 이유. 기록할 수 있으면 null. 화면과 샘플 데이터 저장소가 함께 쓴다. */
export function replyTransitionError(
  from: ReplyStatus | null,
  input: ReplyRecordInput,
): string | null {
  if (!allowedReplyTransitions(from).includes(input.result))
    return "지금 상태에서는 이 상태로 바꿀 수 없습니다.";
  if (replyNoteRequired(from) && !input.note?.trim())
    return "이미 기록한 결과를 바꾸려면 메모를 적어주세요.";
  if ((input.note?.length ?? 0) > replyNoteMax)
    return `메모는 ${replyNoteMax}자까지 적을 수 있습니다.`;
  if ((input.revisitCondition?.length ?? 0) > revisitConditionMax)
    return `다시 연락할 시기·조건은 ${revisitConditionMax}자까지 적을 수 있습니다.`;
  return null;
}

/** 서버로 보낼 값. 빈 메모와, 해당하지 않는 상태의 다시 연락할 시기는 보내지 않는다. */
export function replyRecordBody(input: ReplyRecordInput) {
  const note = input.note?.trim();
  const revisitCondition = revisitConditionApplies(input.result)
    ? input.revisitCondition?.trim()
    : undefined;
  return {
    result: input.result,
    ...(note ? { note } : {}),
    ...(revisitCondition ? { revisitCondition } : {}),
  };
}
