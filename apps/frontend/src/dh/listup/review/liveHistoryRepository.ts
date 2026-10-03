import type { Actor, Recipient } from "./contracts";
import {
  HumanReviewApi,
  type HumanReviewTransport,
  type ApiEnvelope,
} from "./humanReviewApi";
import {
  SavedHistoryRefreshError,
  type HistoryCompany,
  type HistoryData,
  type HistoryQuery,
  type HistoryRepository,
  type HistoryCommand,
  type HistoryProject,
  type HistoryRecipient,
  type HistorySend,
  type HistoryWorkSummary,
  type Outcome,
} from "./historyContracts";

type Quarter = { id: string; year: number; quarter: number };
type Round = {
  id: string;
  targetQuarter: Quarter;
  startedAt: string;
  endedAt: string | null;
};
type Company = { id: string; name: string; description: string | null };
type Project = Omit<
  HistoryProject,
  "ownerName" | "contactName" | "summary" | "resultUrl"
> & { companyId: string; summary: string | null; resultUrl: string | null };
type Send = {
  id: string;
  outreachId: string;
  targetQuarterId: string;
  channel: Recipient["channel"];
  recipientNameSnapshot: string;
  addressSnapshot: string;
  subjectSnapshot: string;
  bodySnapshot: string;
  sentAt: string;
  recordedById: string | null;
};
type Work = HistoryWorkSummary & {
  companyId: string;
  acquisitionRound: Round | null;
  currentTargetQuarter: Quarter;
  version: number;
  contactPurpose: string | null;
  recipient: HistoryRecipient | null;
  contextFingerprint: string;
  draft: {
    revision: number;
    topic: string;
    subject: string;
    body: string;
    contextMatches: boolean;
  } | null;
  latestSend: Send | null;
};
type Event = {
  id: string;
  type: "sent" | "response" | "outcome";
  at: string;
  outreachId: string;
  actor: Actor | null;
  sentMessage?: Send;
  outcome?: { toStatus: Outcome };
  response?: {
    result: string;
    explanation: string | null;
    revisitCondition: string | null;
  };
};
type Page = { nextCursor: string | null; hasMore: boolean };
type Detail = {
  company: Company;
  contacts: HistoryRecipient[];
  researchSummary: string | null;
  events: Event[];
  currentWork: HistoryWorkSummary | null;
  page: Page;
};
type Projects = {
  projects: Project[];
  wonWithoutProject: {
    outreachId: string;
    version: number;
    round: Round | null;
  }[];
  page: Page;
};
type ContactRow = {
  company: Company;
  previousContact: {
    outreachId: string;
    lastSentAt: string;
    targetQuarterId: string;
    owner: Actor;
    outcomeStatus: Outcome | null;
  } | null;
  currentWork: HistoryWorkSummary | null;
};
type CollaborationRow = {
  company: Company;
  latestProject: Project | null;
  projectCount: number;
  wonWithoutProjectCount: number;
  latestWonRound: Round | null;
  currentWork: HistoryWorkSummary | null;
};
const quarterLabel = (q: Quarter) => `${q.year}-Q${q.quarter}`;
const responseLabels: Record<string, string> = {
  no_reply: "응답 없음",
  discussing: "논의 중",
  rejected: "거절",
  deferred: "보류",
  referred: "담당자 소개",
  closed: "종료",
};
const emptyCompany = (c: Company): HistoryCompany => ({
  ...c,
  description: c.description ?? "",
  research: null,
  contacts: [],
  sends: [],
  projects: [],
  wonQuarter: null,
  work: null,
});
const defaults = (): HistoryQuery => ({
  kind: "contact-history",
  filters: {
    query: "",
    outcome: "all",
    quarter: "all",
    owner: "all",
    work: "all",
    sort: "recent",
    page: 1,
  },
});

/** Reads one server page at a time. Detail/history is fetched only for the selected company. */
export class LiveHistoryRepository implements HistoryRepository {
  readonly mode = "live" as const;
  private metadata?: Promise<void>;
  private actor!: Actor;
  private canManage = false;
  private owners: Actor[] = [];
  private members: Actor[] = [];
  private quarters: Quarter[] = [];
  private query = defaults();
  private data?: HistoryData;
  private details = new Map<string, HistoryCompany>();
  private fetchedAt = new Map<string, number>();
  private loadSeq = new Map<string, number>();
  private inflight = new Map<string, Promise<HistoryCompany>>();
  private prefetchRun = 0;
  private retryKeys = new Map<string, string>();
  private completedWrites = new Map<string, string>();
  private readSequence = 0;
  constructor(private api: HumanReviewTransport = new HumanReviewApi()) {}

  private async bootstrap() {
    if (!this.metadata)
      this.metadata = (async () => {
        const [me, permission, allMembers, activeMembers, quarters] =
          await Promise.all([
            this.api.request<{ userId: string; displayName: string }>("/me"),
            this.api.request<{ canManage: boolean }>("/review-queue/summary"),
            this.api.request<{
              items: { id: string; displayName: string }[];
              nextCursor: string | null;
            }>("/members?active=false"),
            this.api.request<{
              items: { id: string; displayName: string }[];
              nextCursor: string | null;
            }>("/members"),
            this.allPages<Quarter>("/target-quarters"),
          ]);
        this.actor = { id: me.data.userId, name: me.data.displayName };
        this.canManage = permission.data.canManage;
        this.owners = allMembers.data.items.map((m) => ({
          id: m.id,
          name: m.displayName,
        }));
        this.members = activeMembers.data.items.map((m) => ({
          id: m.id,
          name: m.displayName,
        }));
        this.quarters = quarters;
      })().catch((error) => {
        this.metadata = undefined;
        throw error;
      });
    await this.metadata;
  }
  private async allPages<T>(path: string) {
    const items: T[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const url: string =
        path +
        (path.includes("?") ? "&" : "?") +
        new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
      const result: ApiEnvelope<T[]> = await this.api.request<T[]>(url);
      items.push(...result.data);
      cursor = result.page?.hasMore ? result.page.nextCursor : null;
      if (cursor && seen.has(cursor))
        throw new Error("페이지 응답을 확인해주세요.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }
  private quarter(id: string) {
    return this.quarters.find((q) => q.id === id)
      ? quarterLabel(this.quarters.find((q) => q.id === id)!)
      : "분기 미기록";
  }
  private project(
    p: Project,
    contacts: HistoryRecipient[] = [],
  ): HistoryProject {
    return {
      ...p,
      summary: p.summary ?? "",
      resultUrl: p.resultUrl ?? "",
      ownerName:
        this.owners.find((m) => m.id === p.ownerId)?.name ??
        (p.ownerId ? "담당자 미확인" : ""),
      contactName:
        contacts.find((c) => c.contactId === p.contactId)?.name ??
        (p.contactId ? "관계자 미확인" : ""),
    };
  }
  private sent(
    s: Send,
    actor?: Actor | null,
    outcome: Outcome | null = null,
    response: string | null = null,
  ): HistorySend {
    return {
      id: s.id,
      outreachId: s.outreachId,
      at: s.sentAt,
      quarter: this.quarter(s.targetQuarterId),
      owner: actor ??
        this.owners.find((m) => m.id === s.recordedById) ?? {
          id: s.recordedById ?? "unknown",
          name: "담당자 미확인",
        },
      recipient: {
        name: s.recipientNameSnapshot,
        title: "",
        channel: s.channel,
        address: s.addressSnapshot,
      },
      subject: s.subjectSnapshot,
      body: s.bodySnapshot,
      outcome,
      response,
    };
  }
  private work(w: Work, sends: HistorySend[]) {
    return {
      id: w.id,
      roundId: w.acquisitionRound?.id ?? "",
      quarter: quarterLabel(w.currentTargetQuarter),
      owner: w.owner,
      version: w.version,
      purpose: w.contactPurpose ?? "",
      recipient: w.recipient
        ? { ...w.recipient, title: w.recipient.title ?? "" }
        : null,
      draft: w.draft,
      sent: w.latestSend
        ? (sends.find((s) => s.id === w.latestSend!.id) ??
          this.sent(w.latestSend, null, w.outcomeStatus))
        : null,
      canEdit: w.canEdit,
      canGenerate: w.canGenerate,
      blockReasons: w.blockReasons,
      contextFingerprint: w.contextFingerprint,
      sendStatus: w.sendStatus,
    };
  }
  getCompany(companyId: string) {
    return this.details.get(companyId);
  }

  async load(query: HistoryQuery = this.query): Promise<HistoryData> {
    const sequence = ++this.readSequence;
    // The list doesn't need members/quarters to be requested, only to be shown, so don't make
    // the first load wait for them. Only the quarter filter needs them up front.
    const ready = this.bootstrap();
    ready.catch(() => undefined);
    if (query.filters.quarter !== "all") await ready;
    if (sequence === this.readSequence) this.query = query;
    const f = query.filters;
    const params = new URLSearchParams({ limit: "15" });
    if (query.cursor) params.set("cursor", query.cursor);
    if (f.query.trim()) params.set("query", f.query.trim());
    if (query.kind === "contact-history") {
      if (f.quarter !== "all") {
        const q = this.quarters.find((q) => quarterLabel(q) === f.quarter);
        if (!q) throw new Error("분기 필터를 다시 선택해주세요.");
        params.set("targetQuarterId", q.id);
      }
      if (f.outcome !== "all") params.set("outcome", f.outcome);
      if (f.owner !== "all") params.set("previousOwnerId", f.owner);
      params.set("currentWork", f.work);
      params.set(
        "sort",
        f.sort === "name"
          ? "name_asc"
          : f.sort === "oldest"
            ? "lastSentAt_asc"
            : "lastSentAt_desc",
      );
    } else {
      if (f.quarter !== "all") {
        const [year, quarter] = f.quarter.split("-Q");
        params.set("year", year);
        params.set("quarter", quarter);
      }
      if (f.outcome !== "all") params.set("status", f.outcome);
      if (f.owner !== "all") params.set("ownerId", f.owner);
    }
    const [round, rows] = await Promise.all([
      this.api.request<Round | null>("/acquisition-rounds/current"),
      this.api.request<(ContactRow | CollaborationRow)[]>(
        `/${query.kind}?${params}`,
      ),
      ready,
    ]);
    const companies = rows.data.map((row) => {
      const c = emptyCompany(row.company);
      if ("previousContact" in row) {
        const previous = row.previousContact;
        c.list = {
          kind: query.kind,
          currentWork: row.currentWork,
          ...(previous
            ? {
                previousContact: {
                  outreachId: previous.outreachId,
                  at: previous.lastSentAt,
                  quarter: this.quarter(previous.targetQuarterId),
                  owner: previous.owner,
                  outcome: previous.outcomeStatus,
                },
              }
            : {}),
        };
      } else {
        c.wonQuarter = row.latestWonRound
          ? quarterLabel(row.latestWonRound.targetQuarter)
          : null;
        c.list = {
          kind: query.kind,
          currentWork: row.currentWork,
          latestProject: row.latestProject
            ? this.project(row.latestProject)
            : undefined,
          projectCount: row.projectCount,
          wonWithoutProjectCount: row.wonWithoutProjectCount,
        };
      }
      return c;
    });
    const data = {
      actor: this.actor,
      canManage: this.canManage,
      round: round.data
        ? {
            id: round.data.id,
            quarter: quarterLabel(round.data.targetQuarter),
            startedAt: round.data.startedAt,
          }
        : null,
      companies,
      page: rows.page ?? { hasMore: false, nextCursor: null },
      members: this.members,
      owners: this.owners,
      quarters: this.quarters.map(quarterLabel).sort().reverse(),
    };
    if (sequence === this.readSequence) this.data = data;
    return data;
  }
  /**
   * `maxAge` (ms) allows a recent copy or an in-flight request to be reused, so a click right
   * after a prefetch costs nothing. Without it the call always hits the server (used after writes).
   */
  loadCompany(
    companyId: string,
    opts?: { maxAge?: number },
  ): Promise<HistoryCompany> {
    if (opts?.maxAge !== undefined) {
      const cached = this.details.get(companyId);
      const at = this.fetchedAt.get(companyId);
      if (cached && at !== undefined && Date.now() - at < opts.maxAge)
        return Promise.resolve(cached);
      const running = this.inflight.get(companyId);
      if (running) return running;
    }
    const request = this.fetchCompany(companyId).finally(() => {
      if (this.inflight.get(companyId) === request)
        this.inflight.delete(companyId);
    });
    this.inflight.set(companyId, request);
    return request;
  }
  /** Warm the cache for rows the user is likely to open. A newer call replaces the older queue; errors are left to the click. */
  async prefetchCompanies(companyIds: string[], maxAge: number, concurrency = 4) {
    const run = ++this.prefetchRun;
    const queue = [...companyIds];
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        for (let id = queue.shift(); id && run === this.prefetchRun; id = queue.shift())
          await this.loadCompany(id, { maxAge }).catch(() => undefined);
      }),
    );
  }
  private async fetchCompany(companyId: string): Promise<HistoryCompany> {
    await this.bootstrap();
    const seq = (this.loadSeq.get(companyId) ?? 0) + 1;
    this.loadSeq.set(companyId, seq);
    const encoded = encodeURIComponent(companyId);
    // Projects and the work row don't depend on the history page, so start them now instead of
    // after it. The work id comes from the list row; if history disagrees we fetch the right one.
    const fetchWork = (id: string) =>
      this.api.request<Work>(`/review-outreaches/${encodeURIComponent(id)}`);
    const guessedWorkId = this.data?.companies.find((row) => row.id === companyId)
      ?.list?.currentWork?.id;
    const projectRequest = this.api.request<Projects>(
      `/companies/${encoded}/projects?limit=100`,
    );
    const guessedWork = guessedWorkId ? fetchWork(guessedWorkId) : undefined;
    // Rejections are re-raised where awaited; this only stops an abandoned request from being "unhandled".
    projectRequest.catch(() => undefined);
    guessedWork?.catch(() => undefined);
    const history = await this.api.request<Detail>(
      `/companies/${encoded}/history?limit=100`,
    );
    const detail = history.data;
    const events = [...detail.events];
    let page = detail.page;
    const seen = new Set<string>();
    while (page.hasMore && page.nextCursor) {
      if (seen.has(page.nextCursor))
        throw new Error("이력 페이지 응답을 확인해주세요.");
      seen.add(page.nextCursor);
      const next = await this.api.request<Detail>(
        `/companies/${encoded}/history?${new URLSearchParams({ limit: "100", cursor: page.nextCursor })}`,
      );
      events.push(...next.data.events);
      page = next.data.page;
    }
    const workId = detail.currentWork?.id;
    const [projectPage, work] = await Promise.all([
      projectRequest,
      !workId
        ? Promise.resolve(null)
        : workId === guessedWorkId
          ? guessedWork!
          : fetchWork(workId),
    ]);
    const projects = [...projectPage.data.projects];
    page = projectPage.data.page;
    seen.clear();
    while (page.hasMore && page.nextCursor) {
      if (seen.has(page.nextCursor))
        throw new Error("프로젝트 페이지 응답을 확인해주세요.");
      seen.add(page.nextCursor);
      const next = await this.api.request<Projects>(
        `/companies/${encoded}/projects?${new URLSearchParams({ limit: "100", cursor: page.nextCursor })}`,
      );
      projects.push(...next.data.projects);
      page = next.data.page;
    }
    // Events arrive newest first. Preserve the message snapshot and attach the latest result/response for its outreach.
    const outcomes = new Map<string, Outcome>();
    const responses = new Map<string, string>();
    for (const e of events) {
      if (e.outcome && !outcomes.has(e.outreachId))
        outcomes.set(e.outreachId, e.outcome.toStatus);
      if (e.response && !responses.has(e.outreachId))
        responses.set(
          e.outreachId,
          [
            responseLabels[e.response.result] ?? e.response.result,
            e.response.explanation,
            e.response.revisitCondition,
          ]
            .filter(Boolean)
            .join(" · "),
        );
    }
    const sends = events
      .filter((e) => e.sentMessage)
      .map((e) =>
        this.sent(
          e.sentMessage!,
          e.actor,
          outcomes.get(e.outreachId) ?? null,
          responses.get(e.outreachId) ?? null,
        ),
      );
    const c = emptyCompany(detail.company);
    c.contacts = detail.contacts.map((r) => ({ ...r, title: r.title ?? "" }));
    c.research = detail.researchSummary;
    c.sends = sends;
    c.projects = projects.map((p) => this.project(p, c.contacts));
    c.work = work ? this.work(work.data, sends) : null;
    c.list = this.data?.companies.find((row) => row.id === companyId)?.list;
    c.wonSources = projectPage.data.wonWithoutProject.map((s) => ({
      outreachId: s.outreachId,
      version: s.version,
      quarter: s.round ? quarterLabel(s.round.targetQuarter) : null,
    }));
    c.wonQuarter =
      this.data?.companies.find((row) => row.id === companyId)?.wonQuarter ??
      c.wonSources.find((s) => s.quarter)?.quarter ??
      null;
    // A slower, older load must not overwrite a newer one (e.g. a prefetch finishing after a save).
    if (this.loadSeq.get(companyId) === seq) {
      this.details.set(companyId, c);
      this.fetchedAt.set(companyId, Date.now());
    }
    return c;
  }
  async searchCompanies(query: string) {
    if (!query.trim()) return [];
    return (
      await this.allPages<Company>(
        `/company-options?${new URLSearchParams({ query: query.trim() })}`,
      )
    ).map(emptyCompany);
  }
  async execute(
    companyId: string,
    version: number | null,
    command: HistoryCommand,
  ) {
    await this.bootstrap();
    const c = this.details.get(companyId);
    const w = c?.work;
    let path: string, method: string, body: unknown;
    if (command.type === "project") {
      if (!this.canManage)
        throw new Error("팀장·관리자만 프로젝트를 변경할 수 있습니다.");
      const p = command.project;
      const fields = {
        title: p.title,
        year: p.year,
        quarter: p.quarter,
        status: p.status,
        summary: p.summary || null,
        ownerId: p.ownerId ?? null,
        contactId: p.contactId ?? null,
        resultUrl: p.resultUrl || null,
      };
      if (p.version > 0) {
        path = `/projects/${encodeURIComponent(p.id)}`;
        method = "PATCH";
        const previous = c?.projects.find((item) => item.id === p.id);
        const { ownerId, contactId, ...otherFields } = fields;
        body = {
          expectedVersion: p.version,
          ...otherFields,
          ...(!previous || ownerId !== (previous.ownerId ?? null)
            ? { ownerId }
            : {}),
          ...(!previous || contactId !== (previous.contactId ?? null)
            ? { contactId }
            : {}),
        };
      } else {
        path = "/projects";
        method = "POST";
        body = {
          company: command.newCompany ?? { id: companyId },
          ...fields,
          ...(p.sourceOutreachId
            ? {
                sourceOutreachId: p.sourceOutreachId,
                expectedSourceOutreachVersion: p.expectedSourceOutreachVersion,
              }
            : {}),
        };
      }
    } else if (command.type === "start") {
      if (!this.data?.round)
        throw new Error("현재 수주 회차가 설정되지 않았습니다.");
      path = `/companies/${encodeURIComponent(companyId)}/outreaches`;
      method = "POST";
      body = {
        expectedRoundId: this.data.round.id,
        entryPoint:
          this.query.kind === "contact-history"
            ? "contact_history"
            : "collaboration_history",
      };
    } else {
      if (
        !w ||
        w.owner.id !== this.actor.id ||
        !w.canEdit ||
        w.sent ||
        w.sendStatus === "sent"
      )
        throw new Error(
          "현재 본인 담당 작업만 수정할 수 있습니다. 최신 상태를 조회해주세요.",
        );
      const base = `/review-outreaches/${encodeURIComponent(w.id)}`;
      const expectedVersion = version ?? w.version;
      if (command.type === "purpose") {
        path = base;
        method = "PATCH";
        body = { expectedVersion, contactPurpose: command.purpose };
      } else if (command.type === "recipient") {
        const r = command.recipient as HistoryRecipient;
        const stored = c!.contacts.find(
          (s) =>
            s.contactId === r.contactId &&
            s.endpointId === r.endpointId &&
            s.name === r.name &&
            s.title === r.title &&
            s.channel === r.channel &&
            s.address === r.address,
        );
        path = base + "/recipient";
        method = "PUT";
        body = {
          expectedVersion,
          recipient: stored
            ? { contactId: stored.contactId, endpointId: stored.endpointId }
            : {
                name: r.name,
                title: r.title,
                channel: r.channel,
                address: r.address,
              },
        };
      } else if (command.type === "generate") {
        if (!w.canGenerate)
          throw new Error("연락 목적·수신자·저장 근거를 확인해주세요.");
        path = base + "/draft-generation";
        method = "POST";
        body = { expectedVersion };
      } else if (command.type === "draft") {
        if (!w.draft) throw new Error("메시지를 먼저 생성해주세요.");
        path = base + "/draft";
        method = "PATCH";
        body = {
          expectedVersion,
          expectedRevision: w.draft.revision,
          topic: w.draft.topic,
          subject: command.subject,
          body: command.body,
          contextFingerprint: w.contextFingerprint,
        };
      } else {
        if (!w.draft?.contextMatches)
          throw new Error("최신 근거로 메시지를 다시 생성해주세요.");
        path = base + "/send-records";
        method = "POST";
        body = { expectedVersion, draftRevision: w.draft.revision };
      }
    }
    const signature = JSON.stringify([
      path,
      method,
      body,
      command.type === "project" ? command.project.id : null,
    ]);
    const key = this.retryKeys.get(signature) ?? crypto.randomUUID();
    let changedId = this.completedWrites.get(signature);
    if (!changedId) {
      this.retryKeys.set(signature, key);
      const result = await this.api.request<Project | Work>(
        path,
        method,
        body,
        key,
      );
      this.retryKeys.delete(signature);
      changedId =
        command.type === "project"
          ? (result.data as Project).companyId
          : companyId;
      this.completedWrites.set(signature, changedId);
    }
    try {
      await this.load(this.query);
      await this.loadCompany(changedId);
      return this.data!;
    } catch {
      throw new SavedHistoryRefreshError(changedId);
    }
  }
}
