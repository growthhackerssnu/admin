export const routes = ["신규 컨택", "다른 관계자", "재접촉", "재협업"] as const;
export type Route = (typeof routes)[number];
export type Stage =
  | "기업 검토"
  | "관계자 선택"
  | "초안 검토"
  | "발송 준비"
  | "응답 확인"
  | "논의 중"
  | "보류"
  | "제외"
  | "이번 차수 건너뛰기"
  | "영구 제외";
export const reasons = [
  "리소스 부족",
  "무관심",
  "문제 해결 수요 없음",
  "기타",
] as const;
export type Reason = (typeof reasons)[number];
export const results = [
  "답변 없음",
  "논의 시작",
  "거절",
  "보류",
  "담당자 안내",
  "연락 종료",
] as const;
export type ResponseResult = (typeof results)[number];
export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  linkedin?: string;
}
export interface Cycle {
  id: string;
  name: string;
  startedAt: string | null;
  endedAt?: string;
}
export interface Draft {
  topic: string;
  subject: string;
  body: string;
  revision: number;
  approvedRevision?: number;
  templateUsed?: { id: string; version: string };
}
export interface SendRecord {
  id: string;
  recipient: Contact;
  subject: string;
  body: string;
  topic: string;
  time: string;
  cycleId: string;
  cycleName: string;
  templateUsed?: Draft["templateUsed"];
}
export interface ResponseInput {
  result: ResponseResult;
  category?: Reason;
  note: string;
  revisit: string;
}
export interface ResponseRecord extends ResponseInput {
  time: string;
  by: string;
}
export interface Recontact {
  reason: string;
  reply: string;
  condition: string;
  contact?: Contact;
}
// Screen-facing view model, not a database table definition.
export interface Company {
  id: string;
  name: string;
  product: string;
  domain: string;
  route: Route;
  stage: Stage;
  owner: string;
  reason: string;
  cycleId: string;
  version: number;
  history: string[];
  lastSentCycleId?: string;
  lastLabel?: string;
  prelaunchContacts?: Contact[];
  previousContact?: Contact;
  contacts?: Contact[];
  recipient?: Contact;
  draft?: Draft;
  sentRecords: SendRecord[];
  response?: ResponseRecord;
  confirmed?: boolean;
  recontact?: Recontact;
  reviewNote?: string;
  conditionEvidence?: string;
  decisionNote?: string;
  skipCycleId?: string;
}
export interface Workspace {
  cycles: Cycle[];
  companies: Company[];
}
export interface Template {
  id: string;
  version: string;
  subject: string;
  body: string;
}
export type TemplateBindings = Record<Route, Template | null>;
export type CompanyCommand =
  | { type: "approveCompany"; reviewNote?: string; conditionEvidence?: string }
  | { type: "skipForCycle" | "excludeCompany"; note: string }
  | { type: "searchContacts" }
  | { type: "selectRecipient"; contactId: string }
  | { type: "changeRecipient" }
  | { type: "generateDraft" }
  | { type: "saveDraft"; values: Pick<Draft, "topic" | "subject" | "body"> }
  | { type: "approveDraft"; revision: number }
  | { type: "recordSimulatedSend"; revision: number }
  | { type: "saveResponse"; values: ResponseInput };
export interface SearchInput {
  newCycle: boolean;
  name: string;
  startedAt: string;
  domains: string[];
  sources: string[];
}
export type Scenario =
  | "normal"
  | "slow"
  | "empty"
  | "read-error"
  | "save-error"
  | "forbidden";
