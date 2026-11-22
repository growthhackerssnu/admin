import type { WorkspaceTone } from "@/components/ui/workspace-status";
import type { Candidate } from "./contracts";
import type { ReplyStatus } from "./replyStatus";

// 후보가 지금 어느 단계인지 나타내는 한 값. 기준은 "다음에 누가 움직여야 하는가"다.
// 판정 규칙의 원본은 백엔드 src/dh/lib/humanReview/stage.ts이고, 화면은 서버가 준 값을 그대로 쓴다.
export type CompanyStage =
  | "researching"
  | "awaiting_assignment"
  | "in_review"
  | "preparing_send"
  | "awaiting_reply"
  | "in_discussion"
  | "won"
  | "closed";
export type CloseReason =
  | "domain_excluded"
  | "unfit"
  | "no_contact"
  | "company_declined"
  | "no_response";
export type ResearchProgress = "waiting" | "running" | "failed";
export interface StageInfo {
  stage: CompanyStage;
  /** 종료 단계에서만 값이 있다. */
  closeReason: CloseReason | null;
  /** 조사 중 단계에서만 값이 있다. */
  researchProgress: ResearchProgress | null;
}

export const stageLabels: Record<CompanyStage, string> = {
  researching: "조사 중",
  awaiting_assignment: "배정 대기",
  in_review: "검토 중",
  preparing_send: "발송 준비",
  awaiting_reply: "회신 대기",
  in_discussion: "논의 중",
  won: "수주",
  closed: "종료",
};
export const closeReasonLabels: Record<CloseReason, string> = {
  domain_excluded: "업종 제외",
  unfit: "부적합",
  no_contact: "연락처 없음",
  company_declined: "기업 거절",
  no_response: "무응답",
};
export const researchProgressLabels: Record<ResearchProgress, string> = {
  waiting: "조사 대기",
  running: "조사 중",
  failed: "재시도 필요",
};

// 서버가 단계를 주지 않는 경우(샘플 데이터, 단계 필드가 없는 이전 서버 응답)에만 쓰는 대체 계산.
// 화면이 아는 필드만으로 백엔드 규칙을 따라간다. 발송 뒤 상태 기록이 없으면 회신 대기로 둔다.
function fallbackStage(candidate: Candidate): StageInfo {
  const info = (stage: CompanyStage, extra: Partial<StageInfo> = {}): StageInfo =>
    ({ stage, closeReason: null, researchProgress: null, ...extra });
  if (candidate.sent.length) {
    if (candidate.outcomeStatus === "won") return info("won");
    if (candidate.outcomeStatus === "in_discussion") return info("in_discussion");
    if (candidate.outcomeStatus === "rejected") return info("closed", { closeReason: "company_declined" });
    if (candidate.outcomeStatus === "unresolved") return info("closed", { closeReason: "no_response" });
    return info("awaiting_reply");
  }
  if (candidate.reviewStatus === "rejected_fit") return info("closed", { closeReason: "unfit" });
  if (candidate.reviewStatus === "rejected_contact") return info("closed", { closeReason: "no_contact" });
  if (candidate.reviewStatus === "approved") return info("preparing_send");
  if (candidate.researchStatus !== "ready")
    return info("researching", {
      researchProgress:
        candidate.researchStatus === "error" ? "failed"
          : candidate.researchStatus === "running" ? "running" : "waiting",
    });
  return info(candidate.owner ? "in_review" : "awaiting_assignment");
}

export function candidateStage(candidate: Candidate): StageInfo {
  return candidate.stage ?? fallbackStage(candidate);
}

// 발송 뒤 상태. 작업 상세를 받았으면 그 값을, 아직 목록 값만 있으면 단계에서 읽는다.
// 발송 전이면 null이다.
/** 잘못 누른 발송 완료를 되돌릴 수 있는지. 서버 규칙과 같다: 회신 대기이고 사람이 상태를 기록한 적이 없으며
 * 회차가 열려 있을 때만. 응답 기록 여부는 화면이 모르므로 서버가 한 번 더 막는다. */
export function canCancelSend(candidate: Candidate): boolean {
  return (
    candidate.sent.length > 0 &&
    candidateReplyStatus(candidate) === "pending" &&
    !candidate.latestOutcome &&
    !candidate.outreachRound?.endedAt &&
    !candidate.messageBlockReasons?.includes("round_closed")
  );
}

export function candidateReplyStatus(candidate: Candidate): ReplyStatus | null {
  if (candidate.outcomeStatus) return candidate.outcomeStatus;
  const { stage, closeReason } = candidateStage(candidate);
  if (stage === "awaiting_reply") return "pending";
  if (stage === "in_discussion" || stage === "won") return stage;
  if (stage === "closed" && closeReason === "company_declined") return "rejected";
  if (stage === "closed" && closeReason === "no_response") return "unresolved";
  return candidate.sent.length ? "pending" : null;
}

// 목록과 상세의 상태 배지. 조사 중은 진행 상황을, 종료는 사유를 보여 준다.
export function stageBadge(candidate: Candidate): { label: string; tone: WorkspaceTone } {
  const { stage, closeReason, researchProgress } = candidateStage(candidate);
  switch (stage) {
    case "researching":
      return {
        label: researchProgressLabels[researchProgress ?? "waiting"],
        tone: researchProgress === "failed" ? "danger" : "info",
      };
    case "awaiting_assignment": return { label: stageLabels[stage], tone: "neutral" };
    case "in_review": return { label: stageLabels[stage], tone: "info" };
    case "preparing_send": return { label: stageLabels[stage], tone: "success" };
    case "awaiting_reply": return { label: stageLabels[stage], tone: "info" };
    case "in_discussion": return { label: stageLabels[stage], tone: "info" };
    case "won": return { label: stageLabels[stage], tone: "success" };
    case "closed":
      return {
        label: closeReason ? closeReasonLabels[closeReason] : stageLabels[stage],
        tone: closeReason === "unfit" ? "danger" : closeReason === "no_contact" ? "warning" : "neutral",
      };
  }
}
