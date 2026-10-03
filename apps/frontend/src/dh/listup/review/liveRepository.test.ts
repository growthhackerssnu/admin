import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedReviewRefreshError, ReviewActionError } from "./contracts";

vi.hoisted(() => { vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test"); });

vi.mock("../../../lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } }, error: null })) } },
}));

import { LiveReviewRepository } from "./liveRepository";

const recipient = { name: "수정 이름", title: "수정 직함", channel: "linkedin" as const, address: "https://www.linkedin.com/in/example-person" };
const initialCandidate = () => ({
  id: "candidate-1", revision: 1,
  company: { name: "테스트 기업", summary: "테스트 소개", websiteUrl: null },
  discovery: { sourceName: "StartupRecipe", url: null, collectedAt: "2026-10-02T00:00:00Z" },
  researchStatus: "ready", reviewStatus: "unreviewed",
  owner: { id: "member-1", name: "담당자" },
  selectedRecipient: null as (typeof recipient & { contactId: string; endpointId: string }) | null,
  outreachId: null as string | null, error: null,
  research: { id: "research-1", createdAt: "2026-10-02T00:00:00Z", claims: [], evidence: [], missingInformation: [] },
});

let row: ReturnType<typeof initialCandidate>;
let saved: boolean;
let failAfterSave: "summary" | "detail" | "write" | null;
let mutationBody: Record<string, unknown> | undefined;
const fetchMock = vi.fn();
const response = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? { data } : { error: { message: "요청 오류" } }), { status });

async function loadedRepository() {
  const repository = new LiveReviewRepository();
  await repository.load();
  await repository.loadCandidate(row.id);
  return repository;
}

describe("live recipient save and refresh", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    row = initialCandidate();
    saved = false;
    mutationBody = undefined;
    failAfterSave = null;
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      if (options.method === "PUT") {
        mutationBody = JSON.parse(options.body as string);
        if (failAfterSave === "write") return response(null, 500);
        saved = true;
        row = { ...row, revision: row.revision + 1, reviewStatus: "reviewing", selectedRecipient: {
          ...recipient, contactId: (mutationBody?.contactId as string | undefined) ?? "new-person", endpointId: "endpoint-1",
        } };
        return response(row);
      }
      if (path.endsWith("/acquisition-rounds/current")) return response(null);
      if (path.endsWith("/me")) return response({ userId: "member-1", displayName: "담당자" });
      if (path.endsWith("/target-quarters")) return response([]);
      if (path.endsWith("/review-queue/summary")) return saved && failAfterSave === "summary" ? response(null, 500) : response({ canManage: false });
      if (path.endsWith("/review-candidates")) return response([row]);
      if (path.endsWith(`/review-candidates/${row.id}`)) return saved && failAfterSave === "detail" ? response(null, 500) : response(row);
      throw new Error(`Unexpected test request: ${path}`);
    });
  });

  it("sends the current person's ID only for an explicit edit", async () => {
    row.selectedRecipient = { ...recipient, name: "이전 이름", contactId: "existing-person", endpointId: "endpoint-1" };
    const repository = await loadedRepository();
    const result = await repository.execute(row.id, 1, { type: "contact", recipient, mode: "edit" }, "operation-1");
    expect(mutationBody?.contactId).toBe("existing-person");
    expect(result.candidates[0].recipient).toEqual(recipient);
    expect(result.candidates[0].recipientContactId).toBe("existing-person");
  });

  it("does not send the existing person's ID when adding another person", async () => {
    row.selectedRecipient = { ...recipient, contactId: "existing-person", endpointId: "endpoint-1" };
    const repository = await loadedRepository();
    await repository.execute(row.id, 1, { type: "contact", recipient, mode: "add" }, "operation-1");
    expect(mutationBody).not.toHaveProperty("contactId");
  });

  it("preserves a successful save if the subsequent detail read fails, and retries reads only", async () => {
    const repository = await loadedRepository();
    failAfterSave = "detail";
    const error = await repository.execute(row.id, 1, { type: "contact", recipient, mode: "add" }, "operation-1").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SavedReviewRefreshError);
    const savedData = (error as SavedReviewRefreshError).data;
    expect(savedData.candidates[0].version).toBe(2);
    expect(savedData.candidates[0].recipient).toEqual(recipient);
    expect(savedData.candidates[0].research?.id).toBe("research-1");
    failAfterSave = null;
    await repository.load();
    const refreshed = await repository.loadCandidate(row.id);
    expect(refreshed.version).toBe(2);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "PUT")).toHaveLength(1);
  });

  it("refreshes only the affected candidate after saving, without reloading summary", async () => {
    const repository = await loadedRepository();
    fetchMock.mockClear();
    failAfterSave = "summary";
    const data = await repository.execute(row.id, 1, { type: "contact", recipient, mode: "add" }, "operation-1");
    expect(data.candidates[0].version).toBe(2);
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).pathname.endsWith("/review-queue/summary"))).toBe(false);
  });

  it("keeps a failed write distinct from a successful write with a failed refresh", async () => {
    const repository = await loadedRepository();
    failAfterSave = "write";
    const error = await repository.execute(row.id, 1, { type: "contact", recipient, mode: "add" }, "operation-1").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SavedReviewRefreshError);
    expect(saved).toBe(false);
    expect((await repository.loadCandidate(row.id)).recipient).toBeNull();
  });

  it("includes the server context fingerprint when saving the discovery draft", async () => {
    row.outreachId = "work-test";
    row.selectedRecipient = { ...recipient, contactId: "person", endpointId: "endpoint" };
    const original = fetchMock.getMockImplementation()!;
    let draftBody: Record<string, unknown> | undefined;
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/work-test/draft") && options.method === "PATCH") {
        draftBody = JSON.parse(options.body as string);
        return response({});
      }
      if (path.endsWith("/work-test")) return response({ id: "work-test", version: 7, contextFingerprint: "saved-context", currentTargetQuarter: { id: "quarter", year: 2026, quarter: 4 }, recipient: row.selectedRecipient, draft: { revision: 3, topic: "주제", subject: "제목", body: "본문", generationResearchId: "research-1", contextMatches: true }, latestSend: null });
      return original(url, options);
    });
    const repository = await loadedRepository();
    fetchMock.mockClear();
    await repository.execute(row.id, 1, { type: "saveDraft", subject: "수정 제목", body: "수정 본문" }, "save-key");
    expect(draftBody).toEqual({ expectedVersion: 7, expectedRevision: 3, topic: "주제", subject: "수정 제목", body: "수정 본문", contextFingerprint: "saved-context" });
    expect(fetchMock.mock.calls.some(([url, options]) => options.method === "GET" && new URL(url).pathname.endsWith("/work-test"))).toBe(true);
  });
});


describe("discovery generation in the fixed acquisition quarter", () => {
  const quarter = { id: "quarter-1", year: 2027, quarter: 1 };
  const initialRound = { id: "round-1", targetQuarter: quarter, startedAt: "2026-10-03T00:00:00Z", endedAt: null };
  let round: typeof initialRound | null;
  let work: Record<string, unknown> | null;
  let prepareFailure: "round" | "lost" | "duplicate" | null;
  let generationFailure: "network" | "lost" | "closed" | null;
  let currentFailure: boolean;
  const generations: { body: unknown; key: string }[] = [];
  const preparations: { body: unknown; key: string }[] = [];
  const workDto = () => ({ id: "work-1", version: 1, contextFingerprint: "context-1", currentTargetQuarter: quarter,
    acquisitionRound: initialRound, recipient: row.selectedRecipient, owner: row.owner,
    canEdit: true, canGenerate: true, blockReasons: [], sendStatus: "before_send", draft: null, latestSend: null });
  const apiError = (code: string) => new Response(JSON.stringify({ error: { code, message: code } }), { status: 409 });
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    row = { ...initialCandidate(), reviewStatus: "approved", selectedRecipient: { ...recipient, contactId: "person", endpointId: "endpoint" } };
    round = initialRound; work = null; prepareFailure = null; generationFailure = null; currentFailure = false;
    preparations.length = 0; generations.length = 0;
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/acquisition-rounds/current")) return currentFailure ? response(null, 500) : response(round);
      if (path.endsWith("/me")) return response({ userId: "member-1", displayName: "담당자" });
      if (path.endsWith("/target-quarters")) return response([quarter]);
      if (path.endsWith("/review-queue/summary")) return response({ canManage: false });
      if (path.endsWith("/review-candidates")) return response([row]);
      if (path.endsWith("/review-candidates/candidate-1")) return response(row);
      if (path.endsWith("/outreaches") && options.method === "POST") {
        preparations.push({ body: JSON.parse(options.body as string), key: (options.headers as Record<string,string>)["Idempotency-Key"] });
        if (prepareFailure === "round") { round = { ...initialRound, id: "round-2" }; return apiError("ROUND_CHANGED"); }
        if (prepareFailure === "duplicate") return apiError("OUTREACH_EXISTS");
        work ??= workDto(); row.outreachId = "work-1";
        if (prepareFailure === "lost") { prepareFailure = null; throw new Error("lost response after save"); }
        return response(work);
      }
      if (path.endsWith("/draft-generation")) {
        const request = { body: JSON.parse(options.body as string), key: (options.headers as Record<string,string>)["Idempotency-Key"] };
        generations.push(request);
        if (generationFailure === "closed") { work = { ...work!, canEdit: false, canGenerate: false, blockReasons: ["round_closed"] }; return apiError("ROUND_CLOSED"); }
        if (generationFailure === "network") throw new Error("offline");
        // Model the backend replay of an idempotent generation request.
        work = { ...work!, version: 2, draft: { revision: 1, topic: "주제", subject: "제목", body: "본문", generationResearchId: "research-1", contextMatches: true } };
        if (generationFailure === "lost") { generationFailure = null; throw new Error("lost generated response"); }
        return response(work);
      }
      if (path.endsWith("/review-outreaches/work-1")) return response(work);
      throw new Error(`Unexpected request: ${path}`);
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("prepares with expectedRoundId and generates in one UI command", async () => {
    const repository = await loadedRepository();
    const data = await repository.execute(row.id, 1, { type: "generate" }, "generate-1");
    expect(preparations[0].body).toEqual({ expectedRevision: 1, expectedRoundId: "round-1" });
    expect(generations[0].body).toEqual({ expectedVersion: 1 });
    expect(data.candidates[0].draft?.subject).toBe("제목");
    expect(data.candidates[0].quarter).toBe("2027-Q1");
  });
  it("keeps prepared work after a generation failure and retries generation only", async () => {
    const repository = await loadedRepository(); generationFailure = "network";
    const failure = await repository.execute(row.id, 1, { type: "generate" }, "generate-1").catch((error) => error);
    expect(failure).toBeInstanceOf(ReviewActionError);
    expect(failure.data.candidates[0].outreachId).toBe("work-1");
    generationFailure = null;
    await repository.execute(row.id, 1, { type: "generate" }, "generate-1");
    expect(preparations).toHaveLength(1);
    expect(generations[0]).toEqual(generations[1]);
  });
  it("replays exactly the same preparation after its response is lost", async () => {
    const repository = await loadedRepository(); prepareFailure = "lost";
    await expect(repository.execute(row.id, 1, { type: "generate" }, "generate-1")).rejects.toBeInstanceOf(ReviewActionError);
    await repository.execute(row.id, 1, { type: "generate" }, "generate-1");
    expect(preparations).toHaveLength(2);
    expect(preparations[0]).toEqual(preparations[1]);
  });
  it("replays generation with its original version after a lost response", async () => {
    const repository = await loadedRepository(); generationFailure = "lost";
    await expect(repository.execute(row.id, 1, { type: "generate" }, "generate-1")).rejects.toBeInstanceOf(ReviewActionError);
    await repository.loadCandidate(row.id, true);
    await repository.execute(row.id, 1, { type: "generate" }, "generate-1");
    expect(preparations).toHaveLength(1);
    expect(generations[0]).toEqual(generations[1]);
  });
  it("refreshes a changed round and requires a new user action rather than silently creating in it", async () => {
    const repository = await loadedRepository(); prepareFailure = "round";
    const failure = await repository.execute(row.id, 1, { type: "generate" }, "generate-1").catch((error) => error);
    expect(failure.data.currentRound.id).toBe("round-2");
    expect(preparations).toHaveLength(1);
    expect(generations).toHaveLength(0);
  });
  it("resumes an existing owned work instead of creating a duplicate", async () => {
    const repository = await loadedRepository(); prepareFailure = "duplicate";
    work = workDto(); row.outreachId = "work-1";
    const data = await repository.execute(row.id, 1, { type: "generate" }, "generate-1");
    expect(data.candidates[0].outreachId).toBe("work-1");
    expect(generations).toHaveLength(1);
  });
  it("does not generate for a duplicate owned by another member", async () => {
    const repository = await loadedRepository(); prepareFailure = "duplicate";
    work = { ...workDto(), canEdit: false, canGenerate: false, blockReasons: ["not_owner"] }; row.outreachId = "work-1";
    await expect(repository.execute(row.id, 1, { type: "generate" }, "generate-1")).rejects.toBeInstanceOf(ReviewActionError);
    expect(generations).toHaveLength(0);
  });
  it("distinguishes no active round from a failed lookup while preserving candidate review", async () => {
    round = null;
    const repository = await loadedRepository();
    expect((await repository.load()).roundError).toBeUndefined();
    await expect(repository.execute(row.id, 1, { type: "generate" }, "generate-1")).rejects.toThrow("팀장 설정 필요");
    currentFailure = true;
    const data = await repository.refreshRound();
    expect(data.candidates).toHaveLength(1);
    expect(data.roundError).toContain("불러오지 못했습니다");
    await expect(repository.execute(row.id, 1, { type: "generate" }, "generate-1")).rejects.toThrow("불러오지 못했습니다");
    expect(preparations).toHaveLength(0);
  });
  it("refreshes read-only flags after a round closes during generation", async () => {
    const repository = await loadedRepository(); generationFailure = "closed";
    const failure = await repository.execute(row.id, 1, { type: "generate" }, "generate-1").catch((error) => error);
    expect(failure.data.candidates[0].canEditMessage).toBe(false);
    expect(failure.data.candidates[0].quarter).toBe("2027-Q1");
  });
});
