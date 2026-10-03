import { supabase } from "../../../lib/supabase";
import { SavedReviewRefreshError } from "./contracts";
import type {
  Actor,
  Candidate,
  CandidateCommand,
  Draft,
  Recipient,
  ReviewData,
  ReviewRepository,
  Research,
} from "./contracts";

type QuarterDto = { id: string; year: number; quarter: number };
type RecipientDto = Recipient & { contactId: string; endpointId: string; title: string | null };
type CandidateDto = {
  id: string;
  revision: number;
  company: { name: string; summary: string | null; websiteUrl: string | null };
  discovery: { sourceName: string | null; url: string | null; collectedAt: string };
  researchStatus: Candidate["researchStatus"];
  reviewStatus: Candidate["reviewStatus"];
  owner: Actor | null;
  selectedRecipient: RecipientDto | null;
  outreachId: string | null;
  error: { message: string; retryable: boolean } | null;
  research?: {
    id: string;
    createdAt: string;
    claims: { category: string; content: string; evidenceIds: string[] }[];
    evidence: { id: string; title: string; excerpt: string; url: string }[];
    missingInformation: string[];
  } | null;
  latestDecision?: {
    action: "approve" | "reject_fit" | "reject_contact" | "reopen";
    fit: "fit" | "unfit" | null;
    contactResult: "confirmed" | "not_found" | "unchecked";
    researchId: string;
    note: string | null;
    decidedBy: Actor;
    createdAt: string;
  } | null;
};
type OutreachDto = {
  id: string;
  version: number;
  currentTargetQuarter: QuarterDto;
  recipient: RecipientDto | null;
  sendStatus: "before_send" | "sent";
  draft: {
    revision: number;
    topic: string;
    subject: string;
    body: string;
    generationResearchId: string | null;
    contextMatches: boolean;
  } | null;
  latestSend: {
    id: string;
    sentAt: string;
    draftRevision: number | null;
    subjectSnapshot: string;
    bodySnapshot: string;
    recordedById: string | null;
  } | null;
};
type Envelope<T> = { data: T; page?: { hasMore: boolean; nextCursor: string | null } };
export type OperationsSummary = {
  assignable: number; researching: number; researchError: number; assigned: number;
  intakePaused: boolean; intakeVersion: number; canManage: boolean;
  pipelineEnabled: boolean;
};
export type AssignmentMember = Actor;
export type AssignmentInput = {
  workStartsOn: string; workEndsOn: string; memberIds: string[]; perMemberCount: number;
};
export type AssignmentPreview = AssignmentInput & {
  eligibleCount: number; selectedCount: number;
  items: { candidateId: string; companyName: string; memberId: string }[];
};

const claimLabels: Record<string, string> = {
  product_service: "제품·서비스",
  target_customer: "주요 고객",
  revenue_model: "수익 모델",
  user_journey: "사용자 여정",
  operations: "운영 방식",
  recent_change: "최근 변화",
  public_challenge: "공개된 과제",
};

function quarterLabel(value: QuarterDto) {
  return `${value.year}-Q${value.quarter}`;
}

function normalizeRecipient(value: RecipientDto | null): Recipient | null {
  return value ? {
    name: value.name,
    title: value.title ?? "",
    channel: value.channel,
    address: value.address,
  } : null;
}

function normalizeResearch(value: CandidateDto["research"]): Research | null {
  if (!value) return null;
  return {
    id: value.id,
    at: value.createdAt,
    facts: value.claims.map((claim) => ({
      title: claimLabels[claim.category] ?? claim.category,
      text: claim.content,
      evidenceId: claim.evidenceIds[0] ?? "",
    })),
    ideas: [],
    evidence: value.evidence.map(({ id, title, excerpt, url }) => ({ id, title, excerpt, url })),
    unknowns: value.missingInformation,
  };
}

function normalizeCandidate(row: CandidateDto, outreach?: OutreachDto): Candidate {
  const recipient = normalizeRecipient(row.selectedRecipient);
  const research = normalizeResearch(row.research);
  const quarter = outreach ? quarterLabel(outreach.currentTargetQuarter) : null;
  const draft: Draft | null = outreach?.draft && outreach.recipient ? {
    revision: outreach.draft.revision,
    approvedRevision: null,
    topic: outreach.draft.topic,
    contextMatches: outreach.draft.contextMatches,
    subject: outreach.draft.subject,
    body: outreach.draft.body,
    quarter: quarter!,
    researchId: outreach.draft.generationResearchId ?? "",
    recipient: normalizeRecipient(outreach.recipient)!,
  } : null;
  const latestDecision = row.latestDecision;
  const sent = outreach?.latestSend && draft ? [{
    id: outreach.latestSend.id,
    at: outreach.latestSend.sentAt,
    actor: { id: outreach.latestSend.recordedById ?? outreach.id, name: "발송 담당자" },
    draft: { ...draft, revision: outreach.latestSend.draftRevision ?? draft.revision,
      subject: outreach.latestSend.subjectSnapshot, body: outreach.latestSend.bodySnapshot },
  }] : [];
  return {
    id: row.id,
    name: row.company.name,
    summary: row.company.summary ?? "",
    website: row.company.websiteUrl ?? "",
    discoveredAt: row.discovery.collectedAt,
    source: row.discovery.sourceName ?? "StartupRecipe",
    sourceUrl: row.discovery.url ?? "",
    researchStatus: row.researchStatus,
    research,
    error: row.error,
    owner: row.owner,
    reviewStatus: row.reviewStatus,
    decisions: latestDecision ? [{
      status: row.reviewStatus,
      fit: latestDecision.fit,
      contact: latestDecision.contactResult,
      actor: latestDecision.decidedBy,
      at: latestDecision.createdAt,
      researchId: latestDecision.researchId,
      note: latestDecision.note ?? "",
    }] : [],
    recipient,
    recipientContactId: row.selectedRecipient?.contactId ?? null,
    contacts: recipient ? [recipient] : [],
    quarter,
    draft,
    sent,
    version: row.revision,
    outreachId: outreach?.id ?? row.outreachId,
    outreachVersion: outreach?.version ?? null,
  };
}

class HumanReviewApi {
  private readonly base: string;
  constructor() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    if (!configured) throw new Error("프론트엔드의 VITE_API_BASE_URL을 설정해주세요.");
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error("백엔드 주소가 올바르지 않습니다.");
    this.base = configured.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
  }
  async request<T>(path: string, method = "GET", body?: unknown, key?: string): Promise<Envelope<T>> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("로그인 후 다시 시도해주세요.");
    const headers: Record<string, string> = { Authorization: `Bearer ${data.session.access_token}` };
    if (method !== "GET") {
      if (!key) throw new Error("요청 식별자가 필요합니다.");
      headers["Content-Type"] = "application/json";
      headers["Idempotency-Key"] = key;
    }
    let response: Response;
    try {
      response = await fetch(this.base + path, {
        method, headers, credentials: "omit", redirect: "error",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error("서버에 연결하지 못했습니다. 처리 여부를 확인한 뒤 다시 시도해주세요.");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message ?? `요청에 실패했습니다. (${response.status})`);
    if (!payload || !("data" in payload)) throw new Error("서버 응답 형식이 올바르지 않습니다.");
    return payload as Envelope<T>;
  }
}

export class LiveReviewRepository implements ReviewRepository {
  readonly mode = "live" as const;
  private readonly api = new HumanReviewApi();
  private quarterIds = new Map<string, string>();
  private data: ReviewData | null = null;
  private details = new Map<string, Candidate>();

  async load(): Promise<ReviewData> {
    const [me, quarters, summary] = await Promise.all([
      this.api.request<{ userId: string; displayName: string }>("/me"),
      this.api.request<QuarterDto[]>("/target-quarters?limit=100"),
      this.api.request<OperationsSummary>("/review-queue/summary"),
    ]);
    this.quarterIds = new Map(quarters.data.map((quarter) => [quarterLabel(quarter), quarter.id]));
    const rows: CandidateDto[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const page: Envelope<CandidateDto[]> = await this.api.request<CandidateDto[]>(`/review-candidates?limit=100${suffix}`);
      rows.push(...page.data);
      const next = page.page?.nextCursor ?? null;
      if (next && seen.has(next)) throw new Error("기업 목록의 페이지를 계속 불러올 수 없습니다.");
      if (next) seen.add(next);
      cursor = page.page?.hasMore ? next : null;
    } while (cursor);
    this.data = {
      schema: 1,
      actor: { id: me.data.userId, name: me.data.displayName },
      canManageOps: summary.data.canManage,
      candidates: rows.map((row) => {
        const detailed = this.details.get(row.id);
        return detailed?.version === row.revision ? detailed : normalizeCandidate(row);
      }),
      quarters: [...this.quarterIds.keys()],
      runs: [],
    };
    return this.data;
  }

  async loadCandidate(id: string): Promise<Candidate> {
    const row = (await this.api.request<CandidateDto>(`/review-candidates/${encodeURIComponent(id)}`)).data;
    const outreach = row.outreachId
      ? (await this.api.request<OutreachDto>(`/review-outreaches/${encodeURIComponent(row.outreachId)}`)).data
      : undefined;
    const candidate = normalizeCandidate(row, outreach);
    this.details.set(id, candidate);
    if (this.data) this.data = {
      ...this.data,
      candidates: this.data.candidates.some((item) => item.id === id)
        ? this.data.candidates.map((item) => item.id === id ? candidate : item)
        : [...this.data.candidates, candidate],
    };
    return candidate;
  }

  async execute(id: string, expectedVersion: number, command: CandidateCommand, key: string): Promise<ReviewData> {
    const candidate = this.data?.candidates.find((item) => item.id === id);
    if (!candidate) throw new Error("기업을 다시 불러와주세요.");
    if (candidate.version !== expectedVersion) throw new Error("기업 정보가 변경됐습니다. 새로고침해주세요.");
    const route = `/review-candidates/${encodeURIComponent(id)}`;
    const outreachId = candidate.outreachId;
    const outreachVersion = candidate.outreachVersion;
    switch (command.type) {
      case "contact": {
        if (["approved", "rejected_fit", "rejected_contact"].includes(candidate.reviewStatus))
          throw new Error("판단 변경으로 검토를 다시 연 뒤 관계자를 수정해주세요.");
        const editing = command.mode !== "add" && Boolean(candidate.recipient);
        if (editing && !candidate.recipientContactId)
          throw new Error("관계자 정보를 다시 불러온 뒤 수정해주세요.");
        const saved = (await this.api.request<CandidateDto>(`${route}/recipient`, "PUT", {
          expectedRevision: expectedVersion,
          ...command.recipient,
          ...(editing ? { contactId: candidate.recipientContactId } : {}),
        }, key)).data;
        const updated = {
          ...normalizeCandidate(saved),
          quarter: candidate.quarter,
          draft: candidate.draft ? { ...candidate.draft, contextMatches: false } : null,
          sent: candidate.sent,
          outreachVersion: candidate.outreachVersion,
        };
        this.details.set(id, updated);
        this.data = { ...this.data!, candidates: this.data!.candidates.map((item) => item.id === id ? updated : item) };
        break;
      }
      case "decide":
      case "reopen":
        await this.api.request(`${route}/decisions`, "POST", {
          expectedRevision: expectedVersion,
          action: command.type === "reopen" ? "reopen" : command.status === "approved" ? "approve" : command.status === "rejected_fit" ? "reject_fit" : "reject_contact",
          ...(command.type === "decide" ? { note: command.note } : {}),
        }, key);
        if (command.type === "decide" && command.status === "approved" && outreachId) {
          const updatedCandidate = (await this.api.request<CandidateDto>(route)).data;
          const outreach = (await this.api.request<OutreachDto>(`/review-outreaches/${encodeURIComponent(outreachId)}`)).data;
          if (updatedCandidate.selectedRecipient && (
            updatedCandidate.selectedRecipient.contactId !== outreach.recipient?.contactId ||
            updatedCandidate.selectedRecipient.endpointId !== outreach.recipient?.endpointId
          )) {
            await this.api.request(`/review-outreaches/${encodeURIComponent(outreachId)}/recipient`, "PATCH", {
              expectedVersion: outreach.version,
              expectedCandidateRevision: updatedCandidate.revision,
            }, `${key}-recipient`);
          }
        }
        break;
      case "quarter": {
        const targetQuarterId = this.quarterIds.get(command.quarter);
        if (!targetQuarterId) throw new Error("등록된 목표 분기를 선택해주세요.");
        if (!outreachId) await this.api.request(`${route}/outreaches`, "POST", { expectedRevision: expectedVersion, targetQuarterId }, key);
        else if (outreachVersion) await this.api.request(`/review-outreaches/${encodeURIComponent(outreachId)}/target-quarter`, "PATCH", { expectedVersion: outreachVersion, targetQuarterId }, key);
        else throw new Error("메시지 업무를 다시 불러와주세요.");
        break;
      }
      case "generate":
        if (!outreachId || !outreachVersion) throw new Error("목표 분기를 선택해 메시지 업무를 준비해주세요.");
        await this.api.request(`/review-outreaches/${encodeURIComponent(outreachId)}/draft-generation`, "POST", { expectedVersion: outreachVersion }, key);
        break;
      case "saveDraft":
        if (!outreachId || !outreachVersion || !candidate.draft) throw new Error("현재 초안을 다시 불러와주세요.");
        await this.api.request(`/review-outreaches/${encodeURIComponent(outreachId)}/draft`, "PATCH", {
          expectedVersion: outreachVersion,
          expectedRevision: candidate.draft.revision,
          topic: candidate.draft.topic ?? candidate.draft.subject,
          subject: command.subject,
          body: command.body,
        }, key);
        break;
      case "send":
        if (!outreachId || !outreachVersion || !candidate.draft) throw new Error("현재 메시지를 다시 불러와주세요.");
        await this.api.request(`/review-outreaches/${encodeURIComponent(outreachId)}/send-records`, "POST", {
          expectedVersion: outreachVersion,
          draftRevision: candidate.draft.revision,
        }, key);
        break;
      case "retry":
        await this.api.request(`${route}/research-retries`, "POST", { expectedRevision: expectedVersion }, key);
        break;
      case "claim":
      case "selectContact":
      case "approveDraft":
        throw new Error("현재 업무 흐름에서 지원하지 않는 행동입니다.");
    }
    try {
      await this.loadCandidate(id);
      return this.data!;
    } catch {
      throw new SavedReviewRefreshError(this.data!);
    }
  }

  async addQuarter(value: string, key: string): Promise<ReviewData> {
    const match = /^(\d{4})-Q([1-4])$/.exec(value);
    if (!match) throw new Error("분기는 YYYY-Q1 형식으로 입력해주세요.");
    await this.api.request("/target-quarters", "POST", { year: Number(match[1]), quarter: Number(match[2]) }, key);
    try {
      return await this.load();
    } catch {
      if (!this.data) throw new Error("분기는 저장됐습니다. 화면을 다시 불러와주세요.");
      throw new SavedReviewRefreshError(this.data);
    }
  }

  async loadOperations() {
    const summary = (await this.api.request<OperationsSummary>("/review-queue/summary")).data;
    const members = summary.canManage
      ? (await this.api.request<AssignmentMember[]>("/review-assignment-members")).data
      : [];
    return { summary, members };
  }

  async previewAssignment(input: AssignmentInput): Promise<AssignmentPreview> {
    const response = await this.api.request<Omit<AssignmentPreview, "memberIds">>(
      "/review-assignment-batches/preview", "POST", input, crypto.randomUUID(),
    );
    return { ...response.data, memberIds: input.memberIds };
  }

  async confirmAssignment(preview: AssignmentPreview, memberIds: string[], key: string) {
    return (await this.api.request<unknown>(
      "/review-assignment-batches", "POST", {
        workStartsOn: preview.workStartsOn,
        workEndsOn: preview.workEndsOn,
        memberIds,
        perMemberCount: preview.perMemberCount,
        items: preview.items.map(({ candidateId, memberId }) => ({ candidateId, memberId })),
      }, key,
    )).data;
  }

  async setIntake(paused: boolean, expectedVersion: number, key: string) {
    return (await this.api.request<{ paused: boolean; version: number }>(
      "/collection-intake", "PATCH", { paused, expectedVersion }, key,
    )).data;
  }
}

export const liveReviewRepository = new LiveReviewRepository();
