// 후보 한 건이 지금 어느 단계인지 한 값으로 정한다. 기준은 "다음에 누가 움직여야 하는가"다.
// 조사·검토·배정·자동 제외·발송·결과 필드의 조합 규칙은 여기 한 곳에만 둔다.
// 화면과 API는 이 값만 보고 필터·배지·버튼을 정한다.

export const COMPANY_STAGES = [
  "researching", // 조사 중: 조사 결과가 아직 없다 (시스템 차례)
  "awaiting_assignment", // 배정 대기: 조사 완료, 담당자 없음 (팀장 차례)
  "in_review", // 검토 중: 담당자가 판단하기 전 (담당 팀원 차례)
  "preparing_send", // 발송 준비: 승인됨, 아직 보내지 않음 (담당 팀원 차례)
  "awaiting_reply", // 회신 대기: 보냈고 결과 없음 (기업 차례)
  "in_discussion", // 논의 중: 답이 왔고 이야기가 오가는 중 (담당자·기업 차례)
  "won", // 수주: 협업 확정. 이후 진행은 프로젝트 상태가 맡는다
  "closed", // 종료: 이번에는 진행하지 않는다. 사유는 closeReason
] as const;
export type CompanyStage = (typeof COMPANY_STAGES)[number];

// 종료 단계에서만 값이 있다. 누가 끝냈는지로 나눈다.
export const CLOSE_REASONS = [
  "domain_excluded", // 업종 제외 (시스템)
  "unfit", // 부적합 (담당자)
  "no_contact", // 연락처 없음 (담당자)
  "company_declined", // 기업 거절 (기업)
  "no_response", // 무응답 (회차 종료)
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

// 조사 중 단계에서만 값이 있는 보조 표시. failed는 사람이 재시도를 눌러야 다시 돈다.
export const RESEARCH_PROGRESS = ["waiting", "running", "failed"] as const;
export type ResearchProgress = (typeof RESEARCH_PROGRESS)[number];

export type StageInput = {
  researchStatus: "queued" | "running" | "ready" | "error" | null;
  reviewStatus: "unreviewed" | "reviewing" | "approved" | "rejected_fit" | "rejected_contact" | null;
  reviewOwnerId: string | null;
  autoExcludedAt: Date | null;
  // 이 후보로 만든 가장 최근 메시지 업무. 없으면 null.
  latestOutreach: {
    sendStatus: "before_send" | "sent" | null;
    outcomeStatus: "pending" | "in_discussion" | "won" | "rejected" | "unresolved" | null;
  } | null;
};

export type StageResult = {
  stage: CompanyStage;
  closeReason: CloseReason | null;
  researchProgress: ResearchProgress | null;
};

const result = (
  stage: CompanyStage,
  extra: Partial<Omit<StageResult, "stage">> = {},
): StageResult => ({ stage, closeReason: null, researchProgress: null, ...extra });

export function companyStage(input: StageInput): StageResult {
  if (input.autoExcludedAt) return result("closed", { closeReason: "domain_excluded" });

  // 발송은 되돌릴 수 없는 사실이라 검토 상태보다 먼저 본다.
  // 결과만 기록되고 발송 상태가 빈 과거 데이터도 발송된 것으로 본다.
  const outreach = input.latestOutreach;
  if (outreach && (outreach.sendStatus === "sent" || outreach.outcomeStatus)) {
    if (outreach.outcomeStatus === "won") return result("won");
    if (outreach.outcomeStatus === "in_discussion") return result("in_discussion");
    if (outreach.outcomeStatus === "rejected")
      return result("closed", { closeReason: "company_declined" });
    if (outreach.outcomeStatus === "unresolved")
      return result("closed", { closeReason: "no_response" });
    return result("awaiting_reply");
  }

  if (input.reviewStatus === "rejected_fit") return result("closed", { closeReason: "unfit" });
  if (input.reviewStatus === "rejected_contact")
    return result("closed", { closeReason: "no_contact" });
  if (input.reviewStatus === "approved") return result("preparing_send");

  if (input.researchStatus !== "ready") {
    return result("researching", {
      researchProgress:
        input.researchStatus === "error"
          ? "failed"
          : input.researchStatus === "running"
            ? "running"
            : "waiting",
    });
  }

  return result(input.reviewOwnerId ? "in_review" : "awaiting_assignment");
}
