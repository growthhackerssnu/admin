import { HumanReviewApi, HumanReviewApiError, type ApiEnvelope as Envelope } from "./humanReviewApi";
import { SavedReviewRefreshError, ReviewActionError, quarterLabel } from "./contracts";
import { AcquisitionQuarterApi } from "./acquisitionQuarter";
import type {
  Actor,
  AcquisitionRound,
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
  contextFingerprint: string;
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
  acquisitionRound?: AcquisitionRound | null;
  canEdit?: boolean;
  canGenerate?: boolean;
  blockReasons?: string[];
  latestSend: {
    id: string;
    sentAt: string;
    draftRevision: number | null;
    subjectSnapshot: string;
    bodySnapshot: string;
    recordedById: string | null;
  } | null;
};
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
    contextFingerprint: outreach.contextFingerprint,
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
    outreachRound: outreach?.acquisitionRound,
    canEditMessage: outreach?.canEdit,
    canGenerateMessage: outreach?.canGenerate,
    messageBlockReasons: outreach?.blockReasons,
  };
}

export class LiveReviewRepository implements ReviewRepository {
  readonly mode = "live" as const;
  private readonly api = new HumanReviewApi();
  readonly acquisitionQuarters = new AcquisitionQuarterApi(this.api);
  private generations = new Map<string, { roundId: string | null; outreachId?: string; version?: number }>();
  private data: ReviewData | null = null;
  private details = new Map<string, Candidate>();

  async load(): Promise<ReviewData> {
    const [me, summary, roundState] = await Promise.all([
      this.api.request<{ userId: string; displayName: string }>("/me"),
      this.api.request<OperationsSummary>("/review-queue/summary"),
      this.readRound(),
    ]);
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
    if (this.data?.currentRound?.id !== roundState.currentRound?.id || roundState.roundError) this.details.clear();
    this.data = {
      ...roundState,
      schema: 1,
      actor: { id: me.data.userId, name: me.data.displayName },
      canManageOps: summary.data.canManage,
      candidates: rows.map((row) => {
        const detailed = this.details.get(row.id);
        return detailed?.version === row.revision ? detailed : normalizeCandidate(row);
      }),
      quarters: roundState.currentRound ? [quarterLabel(roundState.currentRound.targetQuarter)] : [],
      runs: [],
    };
    // 목록을 보여준 다음, 아직 상세(연구 내용 등)를 안 받아본 후보들을 백그라운드로
    // 미리 받아둔다 — 클릭했을 때 다시 기다리지 않도록 하는 캐시 예열이다.
    void Promise.allSettled(
      this.data.candidates
        .filter((c) => this.details.get(c.id)?.version !== c.version)
        .map((c) => this.loadCandidate(c.id)),
    );
    return this.data;
  }

  private async readRound() {
    try { return { currentRound: await this.acquisitionQuarters.current(), roundError: undefined }; }
    catch { return { currentRound: null, roundError: "수주 분기를 불러오지 못했습니다." }; }
  }

  async refreshRound(): Promise<ReviewData> {
    if (!this.data) return this.load();
    this.data = { ...this.data, ...await this.readRound() };
    this.details.clear();
    return this.data;
  }

  private rememberOutreach(id: string, outreach: OutreachDto) {
    const previous = this.data!.candidates.find((item) => item.id === id)!;
    const recipient = normalizeRecipient(outreach.recipient);
    const quarter = quarterLabel(outreach.currentTargetQuarter);
    const draft: Draft | null = outreach.draft && recipient ? {
      ...outreach.draft, contextFingerprint: outreach.contextFingerprint,
      approvedRevision: null, quarter, recipient,
      researchId: outreach.draft.generationResearchId ?? "",
    } : null;
    const updated: Candidate = { ...previous, quarter, draft, outreachId: outreach.id,
      outreachVersion: outreach.version, outreachRound: outreach.acquisitionRound,
      canEditMessage: outreach.canEdit, canGenerateMessage: outreach.canGenerate,
      messageBlockReasons: outreach.blockReasons };
    this.details.set(id, updated);
    this.data = { ...this.data!, candidates: this.data!.candidates.map((item) => item.id === id ? updated : item) };
    return updated;
  }

  async loadCandidate(id: string, force = false): Promise<Candidate> {
    const known = this.data?.candidates.find((item) => item.id === id);
    const cached = this.details.get(id);
    if (!force && cached && known && cached.version === known.version) return cached;
    // outreachId는 보통 이미 로드된 목록에 있으므로, 알고 있다면 후보 상세를 기다리지 않고
    // outreach 상세도 바로 병렬로 요청한다 (모를 때만 후보 상세 응답을 기다려 순차 조회).
    const [row, knownOutreach] = await Promise.all([
      this.api.request<CandidateDto>(`/review-candidates/${encodeURIComponent(id)}`).then((e) => e.data),
      known?.outreachId
        ? this.api.request<OutreachDto>(`/review-outreaches/${encodeURIComponent(known.outreachId)}`).then((e) => e.data)
        : Promise.resolve(undefined),
    ]);
    const outreach = knownOutreach ?? (row.outreachId
      ? (await this.api.request<OutreachDto>(`/review-outreaches/${encodeURIComponent(row.outreachId)}`)).data
      : undefined);
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
          outreachRound: candidate.outreachRound,
          canEditMessage: candidate.canEditMessage,
          canGenerateMessage: candidate.canGenerateMessage,
          messageBlockReasons: candidate.messageBlockReasons,
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
      case "quarter":
        throw new Error("수주 분기는 팀장 설정에서만 변경할 수 있습니다.");
      case "generate": {
        if (candidate.owner?.id !== this.data?.actor?.id || candidate.reviewStatus !== "approved")
          throw new Error("담당 기업을 승인한 뒤 메시지를 생성해주세요.");
        if (candidate.canEditMessage === false || candidate.canGenerateMessage === false)
          throw new Error("현재 메시지 업무는 생성할 수 없습니다. 수주 분기와 관계자를 확인해주세요.");
        let attempt = this.generations.get(key);
        if (!attempt) {
          if (!outreachId && (this.data?.roundError || !this.data?.currentRound))
            throw new Error(this.data?.roundError ?? "수주 분기 미설정 · 팀장 설정 필요");
          attempt = { roundId: this.data?.currentRound?.id ?? null, outreachId: outreachId ?? undefined, version: outreachVersion ?? undefined };
          this.generations.set(key, attempt);
        }
        try {
          if (!attempt.outreachId) {
            try {
              const prepared = (await this.api.request<OutreachDto>(`${route}/outreaches`, "POST", {
                expectedRevision: expectedVersion, expectedRoundId: attempt.roundId,
              }, `${key}-prepare-${attempt.roundId}`)).data;
              this.rememberOutreach(id, prepared);
              attempt.outreachId = prepared.id;
              attempt.version = prepared.version;
            } catch (error) {
              if (!(error instanceof HumanReviewApiError) || error.code !== "OUTREACH_EXISTS") throw error;
              const existing = await this.loadCandidate(id, true);
              if (!existing.outreachId || existing.outreachRound?.id !== attempt.roundId || existing.canEditMessage !== true)
                throw new Error("이미 존재하는 메시지 업무를 확인해주세요. 다른 업무로 자동 전환하지 않습니다.");
              attempt.outreachId = existing.outreachId;
              attempt.version = existing.outreachVersion ?? undefined;
            }
          }
          if (attempt.version === undefined) throw new Error("메시지 업무를 다시 불러와주세요.");
          const generated = (await this.api.request<OutreachDto>(`/review-outreaches/${encodeURIComponent(attempt.outreachId!)}/draft-generation`, "POST",
            { expectedVersion: attempt.version }, `${key}-generate-${attempt.outreachId}-${attempt.version}`)).data;
          this.rememberOutreach(id, generated);
          this.generations.delete(key);
        } catch (error) {
          if (error instanceof HumanReviewApiError && ["ROUND_CHANGED", "NO_ACTIVE_ROUND", "ROUND_CLOSED"].includes(error.code ?? "")) {
            this.generations.delete(key);
            await this.refreshRound();
            // Existing work keeps its own quarter. Refresh its server permission flags, never move it.
            await this.loadCandidate(id, true).catch(() => {
              if (this.data?.candidates.find((item) => item.id === id)?.outreachId) {
                this.data = { ...this.data!, candidates: this.data!.candidates.map((item) => item.id === id
                  ? { ...item, canEditMessage: false, canGenerateMessage: false, messageBlockReasons: ["round_closed"] } : item) };
              }
            });
            throw new ReviewActionError("수주 분기가 변경되었거나 종료됐습니다. 현재 설정과 업무를 확인한 뒤 다시 시도해주세요.", this.data!);
          }
          throw new ReviewActionError(error instanceof Error ? error.message : "메시지를 생성하지 못했습니다.", this.data!);
        }
        break;
      }
      case "saveDraft":
        if (!outreachId || !outreachVersion || !candidate.draft) throw new Error("현재 초안을 다시 불러와주세요.");
        if (!candidate.draft.contextFingerprint) throw new Error("메시지 근거를 다시 불러온 뒤 저장해주세요.");
        await this.api.request(`/review-outreaches/${encodeURIComponent(outreachId)}/draft`, "PATCH", {
          expectedVersion: outreachVersion,
          expectedRevision: candidate.draft.revision,
          topic: candidate.draft.topic ?? candidate.draft.subject,
          subject: command.subject,
          body: command.body,
          contextFingerprint: candidate.draft.contextFingerprint,
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
      // Candidate revision may stay unchanged when only the outreach or draft changes.
      // A completed write must refresh its detail instead of returning the prefetch cache.
      await this.loadCandidate(id, true);
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
