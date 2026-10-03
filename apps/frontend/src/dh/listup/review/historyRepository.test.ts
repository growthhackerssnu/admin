import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewHistoryRepository } from "./historyRepository";
import { collaborationCompany } from "./historyContracts";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
});
describe("history workspace preview boundaries", () => {
  it("fills both mock histories and assigns own example records to the signed-in actor", async () => {
    const actor = { id: "signed-in-user", name: "현재 사용자" };
    const data = await new PreviewHistoryRepository(
      actor,
      false,
      "mock",
    ).load();
    expect(data.companies.filter(collaborationCompany)).toHaveLength(7);
    expect(data.companies.filter((c) => !collaborationCompany(c))).toHaveLength(
      8,
    );
    expect(
      data.companies.find((c) => c.id === "history-morningloop")!.sends[0]
        .owner,
    ).toEqual(actor);
    expect(
      data.companies.find((c) => c.id === "history-sent")!.work?.owner,
    ).toEqual(actor);
    expect(data.canManage).toBe(false);
  });
  it("keeps deployed mock writes separate from development examples and other users", async () => {
    const actor = { id: "mock-user-a", name: "목업 사용자" };
    const repo = new PreviewHistoryRepository(actor, true, "mock");
    await repo.execute("history-morningloop", null, { type: "start" });
    expect(
      (await repo.load()).companies.find((c) => c.id === "history-morningloop")!
        .work?.owner,
    ).toEqual(actor);
    for (const otherRepo of [
      new PreviewHistoryRepository(),
      new PreviewHistoryRepository(
        { id: "mock-user-b", name: "다른 사용자" },
        true,
        "mock",
      ),
    ]) {
      expect(
        (await otherRepo.load()).companies.find(
          (c) => c.id === "history-morningloop",
        )!.work,
      ).toBeNull();
    }
  });
  it("reuses an existing current-round work without taking another owner's assignment", async () => {
    const repo = new PreviewHistoryRepository();
    const data = await repo.execute("history-clearnote", null, {
      type: "start",
    });
    const work = data.companies.find(
      (c) => c.id === "history-clearnote",
    )!.work!;
    expect(work.owner.id).toBe("history-b");
    await expect(
      repo.execute("history-clearnote", work.version, {
        type: "purpose",
        purpose: "changed",
      }),
    ).rejects.toThrow("본인 담당");
  });
  it("keeps past send snapshots when preparing and recording a new first send", async () => {
    const repo = new PreviewHistoryRepository();
    const id = "history-morningloop";
    const prior = (await repo.load()).companies.find((c) => c.id === id)!
      .sends[0];
    let data = await repo.execute(id, null, { type: "start" });
    const version = () =>
      data.companies.find((c) => c.id === id)!.work!.version;
    await expect(
      repo.execute(id, version(), { type: "generate" }),
    ).rejects.toThrow("연락 목적");
    data = await repo.execute(id, version(), {
      type: "purpose",
      purpose: "다음 분기 협업 제안",
    });
    data = await repo.execute(id, version(), { type: "generate" });
    expect(data.companies.find((c) => c.id === id)!.sends).toHaveLength(1);
    data = await repo.execute(id, version(), { type: "send" });
    expect(data.companies.find((c) => c.id === id)!.sends[1]).toEqual(prior);
    expect(data.companies.find((c) => c.id === id)!.work!.sent!.outcome).toBe(
      "pending",
    );
    await expect(repo.execute(id, version(), { type: "send" })).rejects.toThrow(
      "발송을 마쳤습니다",
    );
  });
  it("invalidates the draft after purpose changes and blocks recording a mismatched send", async () => {
    const repo = new PreviewHistoryRepository();
    const id = "history-morningloop";
    let data = await repo.execute(id, null, { type: "start" });
    const version = () =>
      data.companies.find((c) => c.id === id)!.work!.version;
    data = await repo.execute(id, version(), {
      type: "purpose",
      purpose: "새 제안",
    });
    data = await repo.execute(id, version(), { type: "generate" });
    data = await repo.execute(id, version(), {
      type: "purpose",
      purpose: "다른 목적",
    });
    expect(
      data.companies.find((c) => c.id === id)!.work!.draft!.contextMatches,
    ).toBe(false);
    await expect(repo.execute(id, version(), { type: "send" })).rejects.toThrow(
      "초안을 확인",
    );
  });
  it("won companies are visible without fabricated completed projects", async () => {
    const data = await new PreviewHistoryRepository().load();
    const company = data.companies.find((c) => c.id === "history-won")!;
    expect(collaborationCompany(company)).toBe(true);
    expect(company.projects).toHaveLength(0);
    expect(
      data.companies.find((c) => c.id === "history-legacy")!.projects[0].status,
    ).toBeNull();
  });
  it("preserves a won source quarter and rejects a second project from the same source", async () => {
    const repo = new PreviewHistoryRepository();
    const data = await repo.load();
    const project = {
      ...data.companies.find((c) => c.id === "history-vc")!.projects[0],
      id: "won-project",
      year: 2027,
      quarter: 1,
      version: 0,
      sourceOutreachId: "send-super",
    };
    await expect(
      repo.execute("history-won", null, {
        type: "project",
        project: { ...project, quarter: 2 },
      }),
    ).rejects.toThrow("진행 분기");
    await repo.execute("history-won", null, { type: "project", project });
    await expect(
      repo.execute("history-won", null, {
        type: "project",
        project: { ...project, id: "duplicate" },
      }),
    ).rejects.toThrow("이미 등록");
  });
  it("allows a manager to add a historical project without a send, and denies member writes", async () => {
    const repo = new PreviewHistoryRepository();
    const data = await repo.load();
    const project = {
      ...data.companies.find((c) => c.id === "history-vc")!.projects[0],
      id: "new-project",
      version: 0,
    };
    const next = await repo.execute("new", null, {
      type: "project",
      project,
      newCompany: { name: "과거 협업 기업", description: "시연" },
    });
    const added = next.companies.find((c) => c.name === "과거 협업 기업")!;
    expect(added.sends).toHaveLength(0);
    expect(added.projects).toHaveLength(1);
    await expect(
      new PreviewHistoryRepository(data.actor, false).execute(added.id, null, {
        type: "project",
        project,
      }),
    ).rejects.toThrow("팀장·관리자");
  });
});
