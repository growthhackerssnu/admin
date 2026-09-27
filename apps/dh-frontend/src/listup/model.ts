import { contactMessage } from "./messageTemplate";
export type Fit = "fit" | "pending" | "unfit";
export type DraftStatus = "pending" | "ready" | "failed";
export type Channel = "linkedin" | "email";

export interface ActorRef {
  id: string;
  name: string;
}

export interface FitChange {
  fit: Fit;
  by: ActorRef | null;
  at: string | null;
}

// Login is not connected in this preview. Replace this with the authenticated user.
export const previewActor: ActorRef = {
  id: "preview-current-user",
  name: "샘플 팀원 A",
};

export type PreviewUser = ActorRef & {
  role: "member" | "leader";
  jobTitle?: string;
};
export const previewUsers: PreviewUser[] = [
  { ...previewActor, role: "member" },
  { id: "preview-teammate-b", name: "샘플 팀원 B", role: "member" },
  {
    id: "preview-leader",
    name: "여재욱",
    role: "leader",
    jobTitle: "대외협력팀장",
  },
];

// Preview-only guard. The API must enforce this using the authenticated user.
export function canManageCompany(
  state: ListupState,
  user: PreviewUser,
  companyId: string,
) {
  if (user.role === "leader") return true;
  const task = state.tasks.find((item) => item.companyId === companyId);
  const batch = task
    ? state.batches.find((item) => item.id === task.batchId)
    : state.batches.find((item) => item.companyIds.includes(companyId));
  return batch?.assignee?.id === user.id;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  email?: string;
  linkedin?: string;
}

export interface Company {
  id: string;
  name: string;
  service: string;
  area: string;
  about: string;
  possibility: string;
  value: string;
  fit: Fit;
  aiFit: Fit;
  fitChanges: FitChange[];
  people: Person[];
}

export interface Batch {
  id: string;
  quarter: string;
  condition: string | null;
  createdAt: string;
  assignee: ActorRef | null;
  sources: string[];
  companyIds: string[];
  excludedCount: number;
  researchLimit: number;
}

export interface SentRecord {
  channel: Channel;
  recipient: string;
  subject: string;
  body: string;
  at: string;
}

export interface ContactTask {
  companyId: string;
  quarter: string;
  batchId: string;
  status: DraftStatus;
  subject: string;
  body: string;
  personId: string | null;
  channel: Channel | null;
  sent: SentRecord | null;
  needsResearch: boolean;
  noContact?: boolean;
}

export interface ListupState {
  quarter: string;
  quarters: string[];
  companies: Company[];
  batches: Batch[];
  tasks: ContactTask[];
}

export const quarters = ["2026-Q3", "2026-Q4", "2027-Q1"];
export const quarterLabel = (quarter: string) =>
  `${quarter.slice(0, 4)}년 ${quarter.slice(-1)}분기`;
export function quarterOfTimestamp(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}
export const fitLabel: Record<Fit, string> = {
  fit: "적합",
  pending: "판단 보류",
  unfit: "부적합",
};

export function reviewFit(
  company: Company,
  fit: Fit,
  by: ActorRef,
  at: string,
): Company {
  if (company.fit === fit) return company;
  return {
    ...company,
    fit,
    fitChanges: [...company.fitChanges, { fit, by, at }],
  };
}

export function formatActivityTime(at: string | null) {
  if (!at) return "시각 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
}

export function hasContactOption(company: Company) {
  return (
    company.fit === "fit" &&
    company.people.some((person) => person.email || person.linkedin)
  );
}

export function eligibleForBulkEmail(task: ContactTask, company: Company) {
  return (
    !task.sent &&
    !task.noContact &&
    !task.needsResearch &&
    task.status === "ready" &&
    task.channel === "email" &&
    task.personId !== null &&
    !!task.subject.trim() &&
    !!task.body.trim() &&
    !!company.people.find((person) => person.id === task.personId)?.email &&
    hasContactOption(company)
  );
}

export function prepareCandidateTasks(state: ListupState): ListupState {
  const known = new Set(state.tasks.map((task) => task.companyId));
  const created: ContactTask[] = [];
  for (const batch of state.batches) {
    for (const companyId of batch.companyIds) {
      const company = state.companies.find((item) => item.id === companyId);
      if (!company || known.has(companyId)) continue;
      known.add(companyId);
      created.push({
        companyId,
        quarter: batch.quarter,
        batchId: batch.id,
        status: "pending",
        subject: "",
        body: "",
        noContact: false,
        personId: null,
        channel: null,
        sent: null,
        needsResearch: false,
      });
    }
  }
  return created.length
    ? { ...state, tasks: [...state.tasks, ...created] }
    : state;
}

export function draftFor(
  company: Company,
  quarter: string,
  members = previewUsers,
) {
  return contactMessage(company, quarter, members);
}

export function resolvedBody(task: ContactTask, company: Company) {
  const person = company.people.find((item) => item.id === task.personId);
  return task.body
    .replaceAll("{{수신자명}}", person?.name || "{{수신자명}}")
    .replaceAll("{{수신자직함}}", person?.role || "{{수신자직함}}");
}
