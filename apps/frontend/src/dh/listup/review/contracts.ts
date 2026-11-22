import type { StageInfo } from "./stage";
import type { MessageTemplateHint, MessageTemplateStore } from "./messageTemplates";
import type { ReplyRecord, ReplyRecordInput, ReplyStatus } from "./replyStatus";

export type ResearchStatus = "queued" | "running" | "ready" | "error";
export type ReviewStatus =
  | "unreviewed"
  | "reviewing"
  | "approved"
  | "rejected_fit"
  | "rejected_contact";
export interface Actor {
  id: string;
  name: string;
}
export interface Recipient {
  name: string;
  title: string;
  channel: "linkedin" | "email";
  address: string;
}
export interface Research {
  id: string;
  at: string;
  facts: { title: string; text: string; evidenceId: string }[];
  ideas: { title: string; rationale: string; evidenceIds: string[] }[];
  evidence: { id: string; title: string; excerpt: string; url: string }[];
  unknowns: string[];
}
export interface Decision {
  status: ReviewStatus;
  fit: "fit" | "unfit" | null;
  contact: "confirmed" | "not_found" | "unchecked";
  actor: Actor;
  at: string;
  researchId: string;
  note: string;
}
export interface Draft {
  contextFingerprint?: string;
  revision: number;
  approvedRevision: number | null;
  topic?: string;
  contextMatches?: boolean;
  subject: string;
  body: string;
  quarter: string;
  researchId: string;
  recipient: Recipient;
  /** 이 초안을 만든 양식. 양식 도입 전 초안이나 이전 서버 응답에는 없다. */
  messageTemplateId?: string | null;
  messageTemplateVersion?: number | null;
}
export interface Sent {
  id: string;
  at: string;
  actor: Actor;
  draft: Draft;
}
export interface Candidate {
  id: string;
  name: string;
  summary: string;
  website: string;
  discoveredAt: string;
  source: string;
  sourceUrl: string;
  researchStatus: ResearchStatus;
  research: Research | null;
  error: { message: string; retryable: boolean } | null;
  owner: Actor | null;
  reviewStatus: ReviewStatus;
  /** 서버가 계산한 단계. 필터와 배지는 candidateStage()로 이 값을 읽는다. */
  stage?: StageInfo;
  decisions: Decision[];
  recipient: Recipient | null;
  recipientContactId?: string | null;
  /** Additional saved recipients in the frontend preview. `recipient` is the active one. */
  contacts?: Recipient[];
  quarter: string | null;
  draft: Draft | null;
  sent: Sent[];
  version: number;
  outreachId?: string | null;
  outreachVersion?: number | null;
  outreachRound?: AcquisitionRound | null;
  canEditMessage?: boolean;
  canGenerateMessage?: boolean;
  messageBlockReasons?: string[];
  /** 담당자 의도. AI가 쓰는 부분에만 반영되는 선택 입력이다. */
  contactPurpose?: string;
  messageTemplate?: MessageTemplateHint;
  /** 발송 뒤 상태. 작업 상세를 받은 뒤에만 값이 있고, 목록에서는 stage로 읽는다. */
  outcomeStatus?: ReplyStatus | null;
  /** 사람이 마지막으로 남긴 발송 뒤 상태 기록. */
  latestOutcome?: ReplyRecord | null;
  /** 발송 뒤 상태를 기록할 권한(작업 담당자 또는 팀장·관리자). 없으면 화면이 담당자·운영 권한으로 판단한다. */
  canRecordOutcome?: boolean;
}
export interface TargetQuarter { id: string; year: number; quarter: number }
export interface AcquisitionRound {
  id: string;
  targetQuarter: TargetQuarter;
  startedAt: string;
  endedAt: string | null;
}
export const quarterLabel = (value: TargetQuarter) => `${value.year}-Q${value.quarter}`;
export interface CollectionRun {
  id: string;
  at: string;
  source: string;
  status: "completed" | "partial";
  items: {
    id: string;
    title: string;
    url: string;
    names: string[];
    duplicates: number;
    error: string | null;
  }[];
}
export interface ReviewData {
  schema: 1;
  actor?: Actor;
  canManageOps?: boolean;
  candidates: Candidate[];
  /** 내 담당 기업만 먼저 받은 상태. 전체 목록이 오면 사라진다. */
  partial?: boolean;
  quarters: string[];
  runs: CollectionRun[];
  currentRound?: AcquisitionRound | null;
  roundError?: string;
}
export type CandidateCommand =
  | { type: "claim" }
  | { type: "contact"; recipient: Recipient; mode?: "add" | "edit" }
  | { type: "selectContact"; index: number }
  | {
      type: "decide";
      status: "approved" | "rejected_fit" | "rejected_contact";
      note: string;
    }
  | { type: "reopen" }
  | { type: "quarter"; quarter: string }
  | { type: "generate"; templateId?: string; purpose?: string }
  | { type: "saveDraft"; subject: string; body: string }
  | { type: "approveDraft" }
  | { type: "send" }
  /** 잘못 누른 발송 완료를 되돌린다. 회신을 기록하기 전, 열린 회차에서만 된다. */
  | { type: "cancelSend" }
  | ({ type: "outcome" } & ReplyRecordInput)
  | { type: "retry" };
export interface ReviewRepository {
  mode: "preview" | "live";
  /** 초안 화면의 양식 선택에 쓴다. 없으면 양식 선택과 빈 양식 안내를 보여 주지 않는다. */
  messageTemplates?: MessageTemplateStore;
  load(): Promise<ReviewData>;
  /** 첫 화면에 필요한 내 담당 기업만 빠르게 받는다. 이어서 load()로 전체를 채운다. */
  loadFirst?(): Promise<ReviewData>;
  loadCandidate?(id: string): Promise<Candidate>;
  refreshRound?(): Promise<ReviewData>;
  execute(
    id: string,
    expectedVersion: number,
    command: CandidateCommand,
    operationKey: string,
  ): Promise<ReviewData>;
  addQuarter(quarter: string, operationKey: string): Promise<ReviewData>;
}

/** A multi-step action stopped; expose its saved preparation and refreshed round without reporting success. */
export class ReviewActionError extends Error {
  constructor(message: string, readonly data: ReviewData) { super(message); }
}

/** The write succeeded; only the subsequent read failed. Never repeat the write. */
export class SavedReviewRefreshError extends Error {
  constructor(readonly data: ReviewData) {
    super("저장은 완료됐지만 최신 화면을 불러오지 못했습니다. 다시 불러온 뒤 계속 진행해주세요.");
    this.name = "SavedReviewRefreshError";
  }
}

export const researchLabels: Record<ResearchStatus, string> = {
  queued: "조사 대기",
  running: "조사 중",
  ready: "조사 완료",
  error: "조사 오류",
};
export const reviewLabels: Record<ReviewStatus, string> = {
  unreviewed: "미검토",
  reviewing: "검토 중",
  approved: "승인",
  rejected_fit: "부적합",
  rejected_contact: "연락처 없음",
};
export const currentActor: Actor = { id: "preview-a", name: "샘플 팀원 A" };
export const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};
export function validRecipient(value: Recipient) {
  if (!value.name.trim()) return false;
  if (value.channel === "email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.address.trim());
  try {
    const url = new URL(value.address);
    return (
      url.protocol === "https:" &&
      (url.hostname === "linkedin.com" ||
        url.hostname.endsWith(".linkedin.com")) &&
      /^\/in\/[^/]+/.test(url.pathname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function draftCurrent(candidate: Candidate) {
  const { draft, recipient } = candidate;
  return (
    !!draft &&
    !!recipient &&
    draft.contextMatches !== false &&
    draft.quarter === candidate.quarter &&
    draft.researchId === candidate.research?.id &&
    JSON.stringify(draft.recipient) === JSON.stringify(recipient)
  );
}
export function canCopy(candidate: Candidate) {
  return (
    candidate.reviewStatus === "approved" &&
    draftCurrent(candidate)
  );
}
