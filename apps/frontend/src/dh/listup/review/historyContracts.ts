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
  outreachId?: string;
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
  topic?: string;
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
  quarter?: string;
  canEdit?: boolean;
  canGenerate?: boolean;
  blockReasons?: string[];
  contextFingerprint?: string;
  sendStatus?: "before_send" | "sent";
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
  expectedSourceOutreachVersion?: number;
  ownerId?: string | null;
  contactId?: string | null;
}
export interface HistoryRecipient extends Recipient {
  contactId?: string;
  endpointId?: string;
}
export interface HistoryWorkSummary {
  id: string;
  owner: Actor;
  sendStatus: "before_send" | "sent";
  canEdit: boolean;
  canGenerate: boolean;
  outcomeStatus: Outcome | null;
  blockReasons: string[];
}
export interface HistoryListSummary {
  kind: HistoryKind;
  previousContact?: Pick<
    HistorySend,
    "at" | "quarter" | "owner" | "outcome"
  > & { outreachId: string };
  latestProject?: HistoryProject;
  projectCount?: number;
  wonWithoutProjectCount?: number;
  currentWork: HistoryWorkSummary | null;
}
export interface HistoryCompany {
  id: string;
  name: string;
  description: string;
  research: string | null;
  contacts: HistoryRecipient[];
  sends: HistorySend[];
  projects: HistoryProject[];
  wonQuarter: string | null;
  work: HistoryWork | null;
  list?: HistoryListSummary;
  wonSources?: {
    outreachId: string;
    version: number;
    quarter: string | null;
  }[];
}
export interface HistoryData {
  actor: Actor;
  canManage: boolean;
  round: HistoryRound | null;
  companies: HistoryCompany[];
  page?: { nextCursor: string | null; hasMore: boolean };
  members?: Actor[];
  owners?: Actor[];
  quarters?: string[];
}
export interface HistoryFilters {
  query: string;
  outcome: string;
  quarter: string;
  owner: string;
  work: string;
  sort: string;
  page: number;
}
export interface HistoryQuery {
  kind: HistoryKind;
  filters: HistoryFilters;
  cursor?: string | null;
}
export class SavedHistoryRefreshError extends Error {
  constructor(readonly companyId: string) {
    super(
      "저장은 완료됐지만 최신 자료를 불러오지 못했습니다. 다시 조회해주세요.",
    );
  }
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
/** Live data is server-paginated; preview/mock adapters retain their browser-local behavior. */
export interface HistoryRepository {
  mode: "live" | "preview" | "mock" | "unavailable";
  load(query?: HistoryQuery): Promise<HistoryData>;
  loadCompany?(
    companyId: string,
    opts?: { maxAge?: number },
  ): Promise<HistoryCompany>;
  prefetchCompanies?(companyIds: string[], maxAge: number): Promise<void>;
  getCompany?(companyId: string): HistoryCompany | undefined;
  searchCompanies?(query: string): Promise<HistoryCompany[]>;
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
  if (company.work.blockReasons)
    return company.work.blockReasons.map(
      (reason) =>
        historyBlockLabels[reason] ?? "현재 작업 상태를 다시 확인해주세요.",
    );
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
export const historyBlockLabels: Record<string, string> = {
  not_owner: "본인 담당 작업만 수정할 수 있습니다.",
  already_sent: "이번 회차 발송을 마쳤습니다.",
  round_closed: "종료된 수주 분기의 작업입니다.",
  purpose_missing: "이번 연락 목적을 입력해주세요.",
  recipient_missing: "유효한 수신자를 저장해주세요.",
  evidence_missing: "메시지에 사용할 저장 근거가 없습니다.",
};
