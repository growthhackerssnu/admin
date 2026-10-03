import { validRecipient, type Actor, type Recipient } from "./contracts";

export type Outcome = "pending" | "won" | "rejected" | "unresolved";
export type ProjectStatus = "won" | "in_progress" | "completed";
export type HistoryKind = "contact-history" | "collaboration-history";
export interface HistoryRound {
  id: string;
  quarter: string;
  startedAt: string;
}
export interface HistorySend {
  id: string;
  at: string;
  quarter: string;
  owner: Actor;
  recipient: Recipient;
  subject: string;
  body: string;
  outcome: Outcome | null;
  response: string | null;
}
export interface HistoryDraft {
  revision: number;
  subject: string;
  body: string;
  contextMatches: boolean;
}
export interface HistoryWork {
  id: string;
  roundId: string;
  owner: Actor;
  version: number;
  purpose: string;
  recipient: Recipient | null;
  draft: HistoryDraft | null;
  sent: HistorySend | null;
}
export interface HistoryProject {
  id: string;
  title: string;
  year: number | null;
  quarter: number | null;
  status: ProjectStatus | null;
  summary: string;
  ownerName: string;
  contactName: string;
  resultUrl: string;
  version: number;
  sourceOutreachId?: string;
}
export interface HistoryCompany {
  id: string;
  name: string;
  description: string;
  research: string | null;
  contacts: Recipient[];
  sends: HistorySend[];
  projects: HistoryProject[];
  wonQuarter: string | null;
  work: HistoryWork | null;
}
export interface HistoryData {
  actor: Actor;
  canManage: boolean;
  round: HistoryRound | null;
  companies: HistoryCompany[];
}
export type HistoryCommand =
  | { type: "start" }
  | { type: "purpose"; purpose: string }
  | { type: "recipient"; recipient: Recipient }
  | { type: "generate" }
  | { type: "draft"; subject: string; body: string }
  | { type: "send" }
  | {
      type: "project";
      project: HistoryProject;
      newCompany?: { name: string; description: string };
    };
/** Mock writes are browser-local. Live adapter must supply server permissions/version checks. */
export interface HistoryRepository {
  mode: "preview" | "mock" | "unavailable";
  load(): Promise<HistoryData>;
  execute(
    companyId: string,
    version: number | null,
    command: HistoryCommand,
  ): Promise<HistoryData>;
}
export const outcomeLabels: Record<Outcome, string> = {
  pending: "결과 대기",
  won: "수주 완료",
  rejected: "거절",
  unresolved: "결과 미확정",
};
export const projectLabels: Record<ProjectStatus, string> = {
  won: "수주 완료",
  in_progress: "진행 중",
  completed: "완료",
};
export function collaborationCompany(company: HistoryCompany) {
  return (
    company.projects.length > 0 ||
    company.wonQuarter !== null ||
    company.sends.some((send) => send.outcome === "won")
  );
}
export function generationReasons(
  company: HistoryCompany,
  round: HistoryRound | null,
  actor: Actor,
): string[] {
  if (!company.work) return ["메시지 작성을 먼저 시작해주세요."];
  if (company.work.owner.id !== actor.id)
    return [`${company.work.owner.name} 담당 작업입니다.`];
  if (company.work.sent) return ["이번 회차 발송을 마쳤습니다."];
  if (!round || company.work.roundId !== round.id)
    return ["현재 회차 작업이 아닙니다."];
  const reasons: string[] = [];
  if (!company.work.purpose.trim())
    reasons.push("이번 연락 목적을 입력해주세요.");
  if (!company.work.recipient || !validRecipient(company.work.recipient))
    reasons.push("유효한 수신자를 저장해주세요.");
  if (
    !company.research &&
    !company.sends.length &&
    !company.projects.some((p) => p.summary || p.title)
  )
    reasons.push("메시지에 사용할 저장 근거가 없습니다.");
  return reasons;
}
