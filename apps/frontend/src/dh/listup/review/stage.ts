import type { WorkspaceTone } from "@/components/ui/workspace-status";
import type { Candidate } from "./contracts";

// 후보가 지금 어느 단계인지 나타내는 한 값. 기준은 "다음에 누가 움직여야 하는가"다.
// 판정 규칙의 원본은 백엔드 src/dh/lib/humanReview/stage.ts이고, 화면은 서버가 준 값을 그대로 쓴다.
export type CompanyStage =
  | "researching"
  | "awaiting_assignment"
  | "in_review"
  | "preparing_send"
  | "awaiting_reply"
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
// 화면이 아는 필드만으로 백엔드 규칙을 따라가며, 수주·기업 거절·무응답은 알 수 없어 회신 대기로 둔다.
function fallbackStage(candidate: Candidate): StageInfo {
  const info = (stage: CompanyStage, extra: Partial<StageInfo> = {}): StageInfo =>
    ({ stage, closeReason: null, researchProgress: null, ...extra });
  if (candidate.sent.length) return info("awaiting_reply");
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
    case "won": return { label: stageLabels[stage], tone: "success" };
    case "closed":
      return {
        label: closeReason ? closeReasonLabels[closeReason] : stageLabels[stage],
        tone: closeReason === "unfit" ? "danger" : closeReason === "no_contact" ? "warning" : "neutral",
      };
  }
}
