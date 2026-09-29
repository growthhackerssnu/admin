import { describe, it, expect } from "vitest";
import { createMockRepository, type StoragePort } from "./mockRepository";
import type { CompanyCommand, Scenario } from "../models/outreach";
function setup(scenario: Scenario = "normal") {
  let raw: string | null = null;
  const storage: StoragePort = {
    getItem: () => raw,
    setItem: (_, v) => {
      raw = v;
    },
  };
  const repo = createMockRepository(storage, scenario, 0);
  async function act(id: string, command: CompanyCommand) {
    const c = (await repo.load()).companies.find((x) => x.id === id)!;
    return repo.execute(id, c.version, command);
  }
  return { repo, act, storage };
}
describe("mock repository policy and persistence boundary", () => {
  it("blocks repeat contact in the same cycle and unlocks review in the next cycle", async () => {
    const { repo, act } = setup();
    let data = await act("4", {
      type: "saveResponse",
      values: { result: "답변 없음", note: "", revisit: "" },
    });
    expect(data.companies.find((c) => c.id === "4")!.stage).toBe("응답 확인");
    await expect(act("4", { type: "approveCompany" })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await repo.search(
      {
        newCycle: true,
        name: "새 차수",
        startedAt: new Date().toISOString(),
        domains: ["교육"],
        sources: ["A"],
      },
      "cycle-current",
    );
    data = await act("4", {
      type: "saveResponse",
      values: { result: "답변 없음", note: "", revisit: "" },
    });
    expect(data.companies.find((c) => c.id === "4")!.stage).toBe("기업 검토");
    data = await act("4", { type: "approveCompany" });
    expect(data.companies.find((c) => c.id === "4")!.stage).toBe("관계자 선택");
  });
  it("preserves prelaunch history but excludes the previous person", async () => {
    const { act } = setup();
    await act("8", { type: "approveCompany" });
    const data = await act("8", { type: "searchContacts" });
    const c = data.companies.find((x) => x.id === "8")!;
    expect(c.route).toBe("신규 컨택");
    expect(c.contacts!.map((p) => p.id)).toEqual(["doyoon"]);
    expect(c.history[0]).toContain("배포 전");
    await expect(
      act("8", { type: "selectRecipient", contactId: "seoyeon" }),
    ).rejects.toMatchObject({ code: "CONTACT_EXCLUDED" });
  });
  it("requires a template for generation and keeps an existing draft", async () => {
    const { act } = setup();
    await act("6", { type: "searchContacts" });
    await act("6", { type: "selectRecipient", contactId: "doyoon" });
    await expect(act("6", { type: "generateDraft" })).rejects.toMatchObject({
      code: "TEMPLATE_NOT_CONNECTED",
    });
    await act("3", { type: "changeRecipient" });
    const data = await act("3", { type: "generateDraft" });
    expect(data.companies.find((x) => x.id === "3")!.draft!.body).toContain(
      "박서연",
    );
  });
  it("rejects stale revisions and snapshots the approved message once", async () => {
    const { repo, act } = setup();
    await act("3", { type: "approveDraft", revision: 1 });
    await expect(
      act("3", { type: "recordSimulatedSend", revision: 0 }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const data = await act("3", { type: "recordSimulatedSend", revision: 1 });
    const c = data.companies.find((x) => x.id === "3")!;
    expect(c.sentRecords).toHaveLength(1);
    expect(c.sentRecords[0].recipient.name).toBe("박서연");
    expect(c.stage).toBe("응답 확인");
    await expect(
      repo.execute("3", 1, { type: "recordSimulatedSend", revision: 1 }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("invalidates approval when a draft is edited", async () => {
    const { act } = setup();
    await act("3", { type: "approveDraft", revision: 1 });
    const data = await act("3", {
      type: "saveDraft",
      values: { topic: "수정", subject: "수정", body: "수정" },
    });
    expect(
      data.companies.find((x) => x.id === "3")!.draft!.approvedRevision,
    ).toBeUndefined();
  });
  it("does not persist failed writes", async () => {
    const { repo, storage } = setup("save-error");
    await expect(
      repo.execute("1", 1, { type: "approveCompany" }),
    ).rejects.toMatchObject({ code: "SAVE_FAILED" });
    expect(storage.getItem("")).toBeNull();
  });
  it("requires explanation for other rejection and collaboration skip", async () => {
    const { act } = setup();
    await expect(
      act("4", {
        type: "saveResponse",
        values: { result: "거절", category: "기타", note: " ", revisit: "" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      act("3", { type: "skipForCycle", note: "" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("restores skipped companies but not permanently excluded ones", async () => {
    const { repo, act } = setup();
    await act("3", { type: "skipForCycle", note: "인력 부족" });
    await act("1", { type: "excludeCompany", note: "" });
    const data = await repo.search(
      {
        newCycle: true,
        name: "다음 차수",
        startedAt: new Date().toISOString(),
        domains: ["교육"],
        sources: ["A"],
      },
      "cycle-current",
    );
    expect(data.companies.find((x) => x.id === "3")!.stage).toBe("기업 검토");
    expect(data.companies.find((x) => x.id === "1")!.stage).toBe("영구 제외");
  });
  it("detects simultaneous changes rather than overwriting them", async () => {
    const { repo } = setup();
    const outcomes = await Promise.allSettled([
      repo.execute("1", 1, { type: "approveCompany" }),
      repo.execute("1", 1, { type: "excludeCompany", note: "" }),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
  });
  it("keeps the cycle on additional searches and blocks stale cycle starts", async () => {
    const { repo } = setup();
    const data = await repo.search(
      {
        newCycle: false,
        name: "",
        startedAt: new Date().toISOString(),
        domains: ["교육"],
        sources: ["A"],
      },
      "cycle-current",
    );
    expect(data.cycles).toHaveLength(1);
    expect(data.cycles[0].startedAt).toBeNull();
    await expect(
      repo.search(
        {
          newCycle: true,
          name: "다음",
          startedAt: new Date().toISOString(),
          domains: ["교육"],
          sources: ["A"],
        },
        "wrong",
      ),
    ).rejects.toMatchObject({ code: "CYCLE_CHANGED" });
  });
});
