import { beforeEach, describe, expect, it } from "vitest";
import { initialMessageTemplateData } from "./fixtures";
import { HumanReviewApiError } from "./humanReviewApi";
import {
  aiSectionNames,
  insertAtCursor,
  needsManualInput,
  previewSegments,
  pruneAiInstructions,
  renderTemplatePreview,
  templateChoice,
  templateTokens,
  unknownAutoFields,
  unnamedTokens,
  type MessageTemplate,
} from "./messageTemplates";
import {
  previewMessageTemplates,
  renderPreviewDraft,
  resetPreviewSettings,
} from "./previewSettings";
import { settingsSection } from "./SettingsPage";

const autoFields = [
  { name: "기업명", description: "", sample: "모닝루프" },
  { name: "수신자명", description: "", sample: "김민수" },
];
const template = (
  id: string,
  kind: MessageTemplate["kind"],
  version: number,
): MessageTemplate => ({
  id,
  kind,
  name: id,
  version,
  subject: "",
  body: "",
  aiInstructions: {},
  updatedAt: null,
  updatedBy: null,
});

describe("template placeholders", () => {
  it("classifies automatic, AI and manual-input placeholders in order", () => {
    expect(
      templateTokens("{{기업명}} {{AI:제안 동기}} {{입력:불발 사유}} {{ 수신자명 }}"),
    ).toMatchObject([
      { kind: "auto", name: "기업명", raw: "{{기업명}}", index: 0 },
      { kind: "ai", name: "제안 동기" },
      { kind: "input", name: "불발 사유" },
      { kind: "auto", name: "수신자명", raw: "{{ 수신자명 }}" },
    ]);
  });
  it("lists each AI section once across subject and body", () => {
    expect(
      aiSectionNames(
        "{{AI:제목 문구}}",
        "{{AI:제안 동기}}\n{{AI:제목 문구}}\n{{AI:}}",
      ),
    ).toEqual(["제목 문구", "제안 동기"]);
  });
  it("reports automatic names the server cannot fill, but not prefixed ones", () => {
    expect(
      unknownAutoFields(
        "{{기업명}} {{회사명}}",
        "{{AI:아무 이름}} {{입력:아무 항목}} {{회사명}} {{}}",
        autoFields,
      ),
    ).toEqual(["회사명", "(빈 이름)"]);
    expect(unknownAutoFields("{{기업명}}", "{{수신자명}}", autoFields)).toEqual(
      [],
    );
  });
  it("reports prefixed placeholders left without a name", () => {
    expect(unnamedTokens("", "{{AI:}} {{입력: }} {{AI:동기}}")).toEqual([
      "{{AI:}}",
      "{{입력: }}",
    ]);
  });
  it("drops instructions for sections removed from the text", () => {
    expect(
      pruneAiInstructions({ 남는구간: " 두 문장 ", 빠진구간: "삭제" }, [
        "남는구간",
        "새구간",
      ]),
    ).toEqual({ 남는구간: "두 문장", 새구간: "" });
  });
});

describe("template preview", () => {
  it("fills samples and marks AI and manual-input positions", () => {
    expect(
      renderTemplatePreview(
        "{{기업명}} {{수신자명}}님\n{{AI:제안 동기}}\n{{입력:불발 사유}} {{회사명}}",
        autoFields,
      ),
    ).toBe(
      "모닝루프 김민수님\n〔AI: 제안 동기〕\n[입력 필요: 불발 사유] {{회사명}}",
    );
  });
  it("keeps the segment kinds so the screen can highlight them", () => {
    expect(
      previewSegments("{{기업명}}에 {{AI:동기}}{{모름}}", autoFields).map(
        (segment) => segment.kind,
      ),
    ).toEqual(["text", "ai", "unknown"]);
  });
  it("detects a draft that still needs manual input", () => {
    expect(needsManualInput("제목", "지난번에는 [입력 필요: 불발 사유]로")).toBe(
      true,
    );
    expect(needsManualInput("제목", "일정 문제로", null, undefined)).toBe(false);
  });
  it("inserts at the cursor and replaces a selection", () => {
    expect(insertAtCursor("안녕하세요 님", 6, 6, "{{수신자명}}")).toEqual({
      text: "안녕하세요 {{수신자명}}님",
      cursor: 14,
    });
    expect(insertAtCursor("abcdef", 1, 3, "X")).toEqual({
      text: "aXdef",
      cursor: 2,
    });
    expect(insertAtCursor("abc", 99, 99, "!").text).toBe("abc!");
  });
});

describe("template choice on the draft screen", () => {
  const templates = [
    template("new-a", "new", 2),
    template("new-b", "new", 1),
    template("new-empty", "new", 0),
    template("repeat-empty", "repeat_collaboration", 0),
  ];
  it("prefers the draft's template, then the server suggestion, then the first filled one", () => {
    expect(templateChoice(templates, "new", ["new-b", "new-a"]).defaultId).toBe(
      "new-b",
    );
    expect(templateChoice(templates, "new", [null, "new-b"]).defaultId).toBe(
      "new-b",
    );
    expect(
      templateChoice(templates, "new", ["new-empty", undefined]).defaultId,
    ).toBe("new-a");
    expect(templateChoice(templates, "new").options).toHaveLength(3);
  });
  it("blocks generation only when every template of the case is empty", () => {
    expect(templateChoice(templates, "new").blocked).toBe(false);
    expect(templateChoice(templates, "repeat_collaboration")).toMatchObject({
      blocked: true,
      defaultId: null,
    });
    expect(templateChoice(templates, "recontact").blocked).toBe(true);
  });
  it("neither selects nor blocks while the template list is unavailable", () => {
    expect(templateChoice(null, "new")).toEqual({
      options: [],
      defaultId: null,
      blocked: false,
    });
  });
});

describe("settings section address", () => {
  it("falls back to the first section for unknown values", () => {
    expect(settingsSection("templates")).toBe("templates");
    expect(settingsSection("unknown")).toBe("quarter");
    expect(settingsSection(null)).toBe("quarter");
  });
});

describe("sample message template store", () => {
  beforeEach(() => resetPreviewSettings());
  it("serves sample templates for every case", async () => {
    const data = await previewMessageTemplates.load();
    expect(data.templates.map((item) => item.kind)).toEqual(
      initialMessageTemplateData().templates.map((item) => item.kind),
    );
    expect(data.autoFields.length).toBeGreaterThan(0);
    expect(data.sender.leadPhone).toBeNull();
  });
  it("saves a new version, keeps history and prunes removed instructions", async () => {
    const before = (await previewMessageTemplates.load()).templates[0];
    const saved = await previewMessageTemplates.update(
      before.id,
      {
        expectedVersion: before.version,
        name: before.name,
        subject: "{{기업명}} 제안",
        body: "{{AI:제안 동기}}",
        aiInstructions: { "제안 동기": "한 문장", "협업 아이디어": "삭제 대상" },
      },
      "key-1",
    );
    expect(saved.version).toBe(before.version + 1);
    expect(saved.aiInstructions).toEqual({ "제안 동기": "한 문장" });
    const versions = await previewMessageTemplates.versions(before.id);
    expect(versions.map((item) => item.version)).toEqual([3, 2, 1]);
    expect(versions[0].body).toBe("{{AI:제안 동기}}");
  });
  it("rejects unknown automatic names and stale versions like the server", async () => {
    const before = (await previewMessageTemplates.load()).templates[0];
    const input = {
      expectedVersion: before.version,
      name: before.name,
      subject: "제목",
      body: "{{회사명}}",
      aiInstructions: {},
    };
    await expect(
      previewMessageTemplates.update(before.id, input, "key-2"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const stale = previewMessageTemplates.update(
      before.id,
      { ...input, body: "본문", expectedVersion: before.version - 1 },
      "key-3",
    );
    await expect(stale).rejects.toBeInstanceOf(HumanReviewApiError);
    await expect(stale).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("adds an empty template under a case", async () => {
    const created = await previewMessageTemplates.create(
      "recontact",
      " 짧은 재제안 ",
      "key-4",
    );
    expect(created).toMatchObject({
      kind: "recontact",
      name: "짧은 재제안",
      version: 0,
    });
    expect(await previewMessageTemplates.versions(created.id)).toEqual([]);
  });
  it("renders a sample draft and leaves manual input marked", async () => {
    const recontact = (await previewMessageTemplates.load()).templates.find(
      (item) => item.kind === "recontact",
    )!;
    const draft = renderPreviewDraft(
      recontact,
      { 기업명: "테스트기업", 수신자명: "홍길동" },
      (name) => `<${name}>`,
    );
    expect(draft.subject).toContain("테스트기업");
    expect(draft.body).toContain("홍길동님");
    expect(draft.body).toContain("[입력 필요: 불발 사유]");
    expect(draft.body).toContain("<다시 연락한 이유>");
    expect(needsManualInput(draft.subject, draft.body)).toBe(true);
  });
});
