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
  revision: number;
  approvedRevision: number | null;
  subject: string;
  body: string;
  quarter: string;
  researchId: string;
  recipient: Recipient;
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
  decisions: Decision[];
  recipient: Recipient | null;
  /** Additional saved recipients in the frontend preview. `recipient` is the active one. */
  contacts?: Recipient[];
  quarter: string | null;
  draft: Draft | null;
  sent: Sent[];
  version: number;
}
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
  candidates: Candidate[];
  quarters: string[];
  runs: CollectionRun[];
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
  | { type: "generate" }
  | { type: "saveDraft"; subject: string; body: string }
  | { type: "approveDraft" }
  | { type: "send" }
  | { type: "retry" };
export interface ReviewRepository {
  mode: "preview" | "live";
  load(): Promise<ReviewData>;
  execute(
    id: string,
    expectedVersion: number,
    command: CandidateCommand,
    operationKey: string,
  ): Promise<ReviewData>;
  addQuarter(quarter: string, operationKey: string): Promise<ReviewData>;
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
  rejected_fit: "fit 부적합",
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
    draft.quarter === candidate.quarter &&
    draft.researchId === candidate.research?.id &&
    JSON.stringify(draft.recipient) === JSON.stringify(recipient)
  );
}
export function canCopy(candidate: Candidate) {
  return (
    candidate.reviewStatus === "approved" &&
    draftCurrent(candidate) &&
    candidate.draft?.approvedRevision === candidate.draft?.revision
  );
}
