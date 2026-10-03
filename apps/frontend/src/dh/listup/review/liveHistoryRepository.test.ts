import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));
import { LiveHistoryRepository } from "./liveHistoryRepository";
import {
  HumanReviewApiError,
  type HumanReviewTransport,
} from "./humanReviewApi";
import {
  SavedHistoryRefreshError,
  type HistoryCommand,
  type HistoryQuery,
} from "./historyContracts";

const actor = { id: "member-1", name: "성민준" };
const quarter = { id: "q-4", year: 2026, quarter: 4 };
const round = {
  id: "round-4",
  targetQuarter: quarter,
  startedAt: "2026-10-01T00:00:00Z",
  endedAt: null,
};
const company = {
  id: "company-1",
  name: "저장된 기업",
  description: "저장된 설명",
};
const recipient = {
  contactId: "contact-1",
  endpointId: "endpoint-1",
  name: "김담당",
  title: "대표",
  channel: "linkedin" as const,
  address: "https://www.linkedin.com/in/person",
};
const send = {
  id: "send-1",
  outreachId: "old-work",
  targetQuarterId: "q-4",
  channel: "email",
  recipientNameSnapshot: "당시 이름",
  addressSnapshot: "past@example.com",
  subjectSnapshot: "당시 제목",
  bodySnapshot: "당시 본문",
  sentAt: "2026-09-01T00:00:00Z",
  recordedById: "member-2",
};
const summary = () => ({
  id: "work-1",
  owner: actor,
  sendStatus: "before_send",
  canEdit: true,
  canGenerate: true,
  outcomeStatus: null,
  blockReasons: [],
});
const work = () => ({
  ...summary(),
  companyId: company.id,
  acquisitionRound: round,
  currentTargetQuarter: quarter,
  version: 7,
  contactPurpose: "저장된 연락 목적",
  recipient,
  contextFingerprint: "fingerprint-7",
  draft: {
    revision: 3,
    topic: "기존 주제",
    subject: "초안 제목",
    body: "초안 본문",
    contextMatches: true,
  },
  latestSend: null,
});
const project = {
  id: "project-1",
  companyId: company.id,
  title: "저장된 프로젝트",
  year: 2026,
  quarter: 4,
  status: null,
  summary: "요약",
  ownerId: "member-2",
  contactId: "contact-1",
  resultUrl: null,
  version: 4,
  sourceOutreachId: "old-work",
};
const page = { hasMore: false, nextCursor: null };
const query = (
  kind: HistoryQuery["kind"] = "contact-history",
): HistoryQuery => ({
  kind,
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
let current: ReturnType<typeof work>;
let events: unknown[];
let failWrite: boolean;
let failRefresh: boolean;
let saved: boolean;
let request: ReturnType<typeof vi.fn>;

beforeEach(() => {
  current = work();
  failWrite = false;
  failRefresh = false;
  saved = false;
  events = [
    {
      id: "result-2",
      type: "outcome",
      at: "2026-10-02T00:00:00Z",
      outreachId: "old-work",
      actor,
      outcome: { toStatus: "won" },
    },
    {
      id: "response-1",
      type: "response",
      at: "2026-10-01T00:00:00Z",
      outreachId: "old-work",
      actor,
      response: {
        result: "interested",
        explanation: "협업 희망",
        revisitCondition: "다음 분기",
      },
    },
    {
      id: "result-1",
      type: "outcome",
      at: "2026-09-02T00:00:00Z",
      outreachId: "old-work",
      actor,
      outcome: { toStatus: "pending" },
    },
    {
      id: "sent-1",
      type: "sent",
      at: send.sentAt,
      outreachId: "old-work",
      actor: { id: "member-2", name: "기존 담당자" },
      sentMessage: send,
    },
  ];
  request = vi.fn(
    async (path: string, method = "GET", body?: Record<string, unknown>) => {
      const url = new URL(path, "https://example.test");
      const route = url.pathname;
      if (method !== "GET") {
        if (failWrite) throw new HumanReviewApiError("네트워크 오류", 0);
        saved = true;
        if (route === "/projects" || route.startsWith("/projects/"))
          return { data: { ...project, ...body, companyId: company.id } };
        current = { ...current, version: current.version + 1 };
        if (body?.contactPurpose)
          current.contactPurpose = body.contactPurpose as string;
        return { data: current };
      }
      if (saved && failRefresh && route === "/contact-history")
        throw new Error("조회 실패");
      if (route === "/me")
        return { data: { userId: actor.id, displayName: actor.name } };
      if (route === "/review-queue/summary")
        return { data: { canManage: true } };
      if (route === "/members")
        return {
          data: {
            items: [
              { id: actor.id, displayName: actor.name },
              { id: "member-2", displayName: "기존 담당자" },
            ],
            nextCursor: null,
          },
        };
      if (route === "/target-quarters") return { data: [quarter], page };
      if (route === "/acquisition-rounds/current") return { data: round };
      if (route === "/contact-history")
        return {
          data: [
            {
              company,
              previousContact: {
                outreachId: "old-work",
                lastSentAt: send.sentAt,
                targetQuarterId: "q-4",
                owner: actor,
                outcomeStatus: "pending",
              },
              currentWork: summary(),
            },
          ],
          page: { hasMore: true, nextCursor: "next-page" },
        };
      if (route === "/collaboration-history")
        return {
          data: [
            {
              company,
              latestProject: project,
              projectCount: 2,
              wonWithoutProjectCount: 1,
              latestWonRound: round,
              currentWork: summary(),
            },
          ],
          page,
        };
      if (route.endsWith("/history"))
        return {
          data: {
            company,
            researchSummary: "저장 조사",
            contacts: [recipient],
            events,
            currentWork: summary(),
            page,
          },
        };
      if (route.endsWith("/projects"))
        return {
          data: {
            projects: [project],
            wonWithoutProject: [{ outreachId: "won-work", version: 9, round }],
            page,
          },
        };
      if (route === "/review-outreaches/work-1") return { data: current };
      if (route === "/company-options")
        return { data: [{ ...company, id: "never-contacted" }], page };
      throw new Error(`Unexpected route ${path}`);
    },
  );
});
const repo = () =>
  new LiveHistoryRepository({ request } as HumanReviewTransport);
async function loaded() {
  const r = repo();
  await r.load(query());
  await r.loadCompany(company.id);
  request.mockClear();
  return r;
}

describe("live history API contract", () => {
  it("does not resubmit unchanged owner/contact references when editing an old project", async () => {
    const r = await loaded();
    const p = r.getCompany(company.id)!.projects[0];
    await r.execute(company.id, null, {
      type: "project",
      project: { ...p, status: "completed", summary: "수정 요약" },
    });
    const body = request.mock.calls[0][2];
    expect(body).toMatchObject({
      expectedVersion: 4,
      title: p.title,
      status: "completed",
      summary: "수정 요약",
    });
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("contactId");
  });
  it("uses server filters, IDs and cursor without fetching every company detail", async () => {
    const r = repo();
    const q = query();
    q.filters = {
      ...q.filters,
      query: "검색",
      outcome: "pending",
      quarter: "2026-Q4",
      owner: "member-2",
      work: "mine",
      sort: "name",
    };
    q.cursor = "page-2";
    const data = await r.load(q);
    const call = request.mock.calls.find(([p]) =>
      p.startsWith("/contact-history"),
    )!;
    const params = new URL(call[0], "https://test").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      limit: "15",
      cursor: "page-2",
      query: "검색",
      targetQuarterId: "q-4",
      outcome: "pending",
      previousOwnerId: "member-2",
      currentWork: "mine",
      sort: "name_asc",
    });
    expect(data.page).toEqual({ hasMore: true, nextCursor: "next-page" });
    expect(data.companies[0].list?.previousContact?.quarter).toBe("2026-Q4");
    expect(request.mock.calls.some(([p]) => p.includes("/companies/"))).toBe(
      false,
    );
  });
  it("maps project summaries and omits filters the collaboration API does not support", async () => {
    const q = query("collaboration-history");
    q.filters = {
      ...q.filters,
      quarter: "2026-Q4",
      outcome: "unknown",
      owner: "member-2",
      sort: "name",
      work: "mine",
    };
    const data = await repo().load(q);
    const call = request.mock.calls.find(([p]) =>
      p.startsWith("/collaboration-history"),
    )!;
    expect(
      Object.fromEntries(new URL(call[0], "https://test").searchParams),
    ).toEqual({
      limit: "15",
      year: "2026",
      quarter: "4",
      status: "unknown",
      ownerId: "member-2",
    });
    expect(data.companies[0].list).toMatchObject({
      projectCount: 2,
      wonWithoutProjectCount: 1,
      latestProject: { status: null, ownerName: "기존 담당자" },
    });
  });
  it("keeps historical recipient/text/actor snapshots and attaches the latest outcome", async () => {
    const r = repo();
    await r.load(query());
    const c = await r.loadCompany(company.id);
    expect(c.sends[0]).toMatchObject({
      id: "send-1",
      outreachId: "old-work",
      subject: "당시 제목",
      body: "당시 본문",
      owner: { name: "기존 담당자" },
      recipient: { name: "당시 이름", address: "past@example.com" },
      outcome: "won",
      response: "interested · 협업 희망 · 다음 분기",
    });
    expect(c.projects[0]).toMatchObject({
      contactName: "김담당",
      ownerId: "member-2",
      contactId: "contact-1",
      status: null,
    });
    expect(c.wonSources).toEqual([
      { outreachId: "won-work", version: 9, quarter: "2026-Q4" },
    ]);
    expect(c.work).toMatchObject({
      version: 7,
      canEdit: true,
      contextFingerprint: "fingerprint-7",
    });
  });
  it("reads nested detail pagination rather than silently dropping older events", async () => {
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      if (args[0].includes("/history?")) {
        const cursor = new URL(args[0], "https://test").searchParams.get(
          "cursor",
        );
        return {
          data: {
            company,
            researchSummary: null,
            contacts: [],
            currentWork: null,
            events: cursor ? events : [],
            page: cursor ? page : { hasMore: true, nextCursor: "older" },
          },
        };
      }
      return result;
    });
    const c = await repo().loadCompany(company.id);
    expect(c.sends).toHaveLength(1);
    expect(request.mock.calls.some(([p]) => p.includes("cursor=older"))).toBe(
      true,
    );
  });
  it("searches existing companies beyond the current history page", async () => {
    const c = await repo().searchCompanies("아직 연락하지 않은 기업");
    expect(c[0].id).toBe("never-contacted");
  });
  it.each([
    [
      { type: "purpose", purpose: "새 목적" },
      "/review-outreaches/work-1",
      "PATCH",
      { expectedVersion: 7, contactPurpose: "새 목적" },
    ],
    [
      { type: "recipient", recipient },
      "/review-outreaches/work-1/recipient",
      "PUT",
      {
        expectedVersion: 7,
        recipient: { contactId: "contact-1", endpointId: "endpoint-1" },
      },
    ],
    [
      { type: "recipient", recipient: { ...recipient, name: "수정 이름" } },
      "/review-outreaches/work-1/recipient",
      "PUT",
      {
        expectedVersion: 7,
        recipient: {
          name: "수정 이름",
          title: "대표",
          channel: "linkedin",
          address: recipient.address,
        },
      },
    ],
    [
      { type: "generate" },
      "/review-outreaches/work-1/draft-generation",
      "POST",
      { expectedVersion: 7 },
    ],
    [
      { type: "draft", subject: "수정 제목", body: "수정 본문" },
      "/review-outreaches/work-1/draft",
      "PATCH",
      {
        expectedVersion: 7,
        expectedRevision: 3,
        topic: "기존 주제",
        subject: "수정 제목",
        body: "수정 본문",
        contextFingerprint: "fingerprint-7",
      },
    ],
    [
      { type: "send" },
      "/review-outreaches/work-1/send-records",
      "POST",
      { expectedVersion: 7, draftRevision: 3 },
    ],
  ])(
    "writes the exact contract for %j",
    async (command, path, method, body) => {
      const r = await loaded();
      await r.execute(company.id, 7, command as HistoryCommand);
      expect(request.mock.calls[0].slice(0, 3)).toEqual([path, method, body]);
      expect(request.mock.calls[0][3]).toEqual(expect.any(String));
    },
  );
  it("starts in the active round with the correct entry point and keeps the server owner", async () => {
    const r = repo();
    await r.load(query("collaboration-history"));
    request.mockClear();
    await r.execute(company.id, null, { type: "start" });
    expect(request.mock.calls[0].slice(0, 3)).toEqual([
      "/companies/company-1/outreaches",
      "POST",
      { expectedRoundId: "round-4", entryPoint: "collaboration_history" },
    ]);
  });
  it.each(["not_owner", "already_sent", "round_closed"])(
    "blocks writes when the server reports %s",
    async (reason) => {
      current.canEdit = false;
      current.blockReasons = [reason] as never[];
      const r = await loaded();
      await expect(
        r.execute(company.id, 7, { type: "purpose", purpose: "변경" }),
      ).rejects.toThrow("본인 담당");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("retains the idempotency key when a write response is lost", async () => {
    const r = await loaded();
    failWrite = true;
    await expect(
      r.execute(company.id, 7, { type: "purpose", purpose: "변경" }),
    ).rejects.toThrow();
    const key = request.mock.calls[0][3];
    request.mockClear();
    failWrite = false;
    await r.execute(company.id, 7, { type: "purpose", purpose: "변경" });
    expect(request.mock.calls[0][3]).toBe(key);
  });
  it("distinguishes a successful save from refresh failure and does not repeat project creation", async () => {
    const r = await loaded();
    failRefresh = true;
    const command: HistoryCommand = {
      type: "project",
      project: {
        ...project,
        status: "won",
        version: 0,
        summary: "요약",
        resultUrl: "",
        ownerName: "기존 담당자",
        contactName: "김담당",
        expectedSourceOutreachVersion: 9,
      },
    };
    await expect(r.execute(company.id, null, command)).rejects.toBeInstanceOf(
      SavedHistoryRefreshError,
    );
    const body = request.mock.calls[0][2];
    expect(body).toMatchObject({
      company: { id: company.id },
      ownerId: "member-2",
      contactId: "contact-1",
      sourceOutreachId: "old-work",
      expectedSourceOutreachVersion: 9,
    });
    expect(body).not.toHaveProperty("ownerName");
    failRefresh = false;
    request.mockClear();
    await r.execute(company.id, null, command);
    expect(
      request.mock.calls.every(([, method]) => !method || method === "GET"),
    ).toBe(true);
  });
});

describe("company detail loading", () => {
  const paths = () => request.mock.calls.map(([path]) => new URL(path, "https://x.test").pathname);
  // Holds the history response until released so we can see what was requested meanwhile.
  function gateHistory() {
    const base = request.getMockImplementation()!;
    let release!: () => void;
    const open = new Promise<void>((resolve) => (release = resolve));
    request.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (new URL(path, "https://x.test").pathname.endsWith("/history")) await open;
      return (base as (...args: unknown[]) => unknown)(path, ...rest);
    });
    return release;
  }

  it("requests projects and the work row without waiting for history", async () => {
    const r = repo();
    await r.load(query());
    request.mockClear();
    const release = gateHistory();
    const loading = r.loadCompany(company.id);
    await vi.waitFor(() => expect(paths()).toContain("/review-outreaches/work-1"));
    expect(paths()).toContain(`/companies/${company.id}/projects`);
    release();
    expect((await loading).work?.id).toBe("work-1");
  });

  it("reuses a fresh copy only when maxAge is given", async () => {
    const r = await loaded();
    await r.loadCompany(company.id, { maxAge: 60_000 });
    expect(request).not.toHaveBeenCalled();
    await r.loadCompany(company.id);
    expect(paths()).toContain(`/companies/${company.id}/history`);
  });

  it("shares one in-flight request between a prefetch and a click", async () => {
    const r = repo();
    await r.load(query());
    request.mockClear();
    const [a, b] = await Promise.all([
      r.loadCompany(company.id, { maxAge: 60_000 }),
      r.loadCompany(company.id, { maxAge: 60_000 }),
    ]);
    expect(a).toBe(b);
    expect(paths().filter((p) => p.endsWith("/history"))).toHaveLength(1);
  });

  it("does not let an older load overwrite the one started after a save", async () => {
    const r = repo();
    await r.load(query());
    const release = gateHistory();
    const older = r.loadCompany(company.id);
    await vi.waitFor(() => expect(paths()).toContain("/review-outreaches/work-1"));
    const base = request.getMockImplementation()!;
    request.mockImplementation(async (path: string, ...rest: unknown[]) => {
      const result = (await (base as (...args: unknown[]) => unknown)(path, ...rest)) as {
        data: { researchSummary?: string };
      };
      if (new URL(path, "https://x.test").pathname.endsWith("/history"))
        return { data: { ...result.data, researchSummary: "새 조사" } };
      return result;
    });
    release();
    await older;
    const newer = await r.loadCompany(company.id);
    expect(newer.research).toBe("새 조사");
    expect(r.getCompany(company.id)?.research).toBe("새 조사");
  });

  it("requests the list without waiting for members and quarters", async () => {
    const base = request.getMockImplementation()!;
    let release!: () => void;
    const open = new Promise<void>((resolve) => (release = resolve));
    request.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (new URL(path, "https://x.test").pathname === "/members") await open;
      return (base as (...args: unknown[]) => unknown)(path, ...rest);
    });
    const loading = repo().load(query());
    await vi.waitFor(() => expect(paths()).toContain("/contact-history"));
    release();
    expect((await loading).companies).toHaveLength(1);
  });

  it("prefetches each company once, and a newer prefetch drops the old queue", async () => {
    const r = repo();
    await r.load(query());
    request.mockClear();
    await r.prefetchCompanies([company.id], 60_000);
    expect(paths().filter((p) => p.endsWith("/history"))).toHaveLength(1);
    request.mockClear();
    await r.prefetchCompanies([company.id], 60_000);
    expect(request).not.toHaveBeenCalled();
    const first = r.prefetchCompanies(["a", "b", "c", "d", "e", "f"], 60_000, 1);
    await r.prefetchCompanies([], 60_000);
    await first;
    expect(paths().filter((p) => p.endsWith("/history")).length).toBeLessThan(6);
  });
});
