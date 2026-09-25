export type Fit = "fit" | "pending" | "unfit";
export type DraftStatus = "pending" | "ready" | "failed";
export type Channel = "linkedin" | "email";

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
  changedByUser?: boolean;
  people: Person[];
}

export interface Batch {
  id: string;
  quarter: string;
  condition: string | null;
  createdAt: string;
  sources: string[];
  companyIds: string[];
  excludedCount: number;
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
}

export interface ListupState {
  quarter: string;
  companies: Company[];
  batches: Batch[];
  tasks: ContactTask[];
}

export const quarters = ["2026-Q3", "2026-Q4", "2027-Q1"];
export const quarterLabel = (quarter: string) =>
  `${quarter.slice(0, 4)}년 ${quarter.slice(-1)}분기`;
export const fitLabel: Record<Fit, string> = {
  fit: "적합",
  pending: "판단 보류",
  unfit: "부적합",
};

export function canHandoff(company: Company) {
  return (
    company.fit === "fit" &&
    company.people.some((person) => person.email || person.linkedin)
  );
}

export function preferredRoute(company: Company): Channel | null {
  if (company.people.some((person) => person.linkedin)) return "linkedin";
  if (company.people.some((person) => person.email)) return "email";
  return null;
}

export function eligibleForBulkEmail(task: ContactTask, company: Company) {
  return (
    !task.sent &&
    task.status === "ready" &&
    task.channel === "email" &&
    task.personId !== null &&
    !!company.people.find((person) => person.id === task.personId)?.email &&
    preferredRoute(company) === "email"
  );
}

export function draftFor(company: Company) {
  return {
    subject: `[GrowthHackers SNU] ${company.name} 협업 제안`,
    body: `안녕하세요, {{수신자명}}님.\nGrowthHackers SNU입니다.\n\n${company.name}의 서비스를 살펴보며 ${company.area} 영역에서 함께 실험할 기회가 있다고 생각해 연락드립니다.\n\n사용자 이용 흐름을 분석하고 개선 가설을 검증하는 프로젝트를 제안드립니다. 구체적인 실행 범위와 목표는 실제 사업의 우선순위를 함께 확인한 뒤 정하고자 합니다.\n\n가능하시다면 짧은 미팅에서 협업 가능성을 이야기 나눌 수 있을까요?\n\n감사합니다.\nGrowthHackers SNU 드림`,
  };
}

export function resolvedBody(task: ContactTask, company: Company) {
  const person = company.people.find((item) => item.id === task.personId);
  return task.body.replaceAll("{{수신자명}}", person?.name || "{{수신자명}}");
}
