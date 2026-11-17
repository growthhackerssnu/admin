import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_FIELDS,
  cleanInstructions,
  hasMissingInput,
  MissingSlotError,
  parseSlots,
  renderTemplate,
  suggestTemplate,
  templateKindOf,
  templateProblems,
} from "./messageTemplate";

describe("message template slots", () => {
  it("separates auto, AI, and manual slots and flags unknown names", () => {
    const slots = parseSlots("{{기업명}} 제안", "{{AI:제안 동기}}하여 {{ 입력 : 불발 사유 }} {{기업명}} {{없는 이름}}");
    expect(slots).toEqual({ auto: ["기업명"], ai: ["제안 동기"], manual: ["불발 사유"], unknown: ["없는 이름"] });
  });

  it("reports problems that should block saving", () => {
    expect(templateProblems("제목", "본문 {{기업명}}")).toEqual([]);
    expect(templateProblems("", "")).toEqual(["제목을 입력하세요.", "본문을 입력하세요."]);
    expect(templateProblems("제목", "{{회사}}")[0]).toContain("{{회사}}");
    expect(templateProblems("제목", "{{기업명} 님")[0]).toContain("짝");
  });

  it("keeps instructions only for AI slots that are still in the template", () => {
    expect(cleanInstructions({ "제안 동기": " 한 문장 ", 지운것: "x" }, ["제안 동기", "새 구간"]))
      .toEqual({ "제안 동기": "한 문장", "새 구간": "" });
  });
});

describe("message template rendering", () => {
  const values = {
    auto: { 기업명: "모닝루프", "팀장 전화번호": "010-1111-2222" },
    ai: { "제안 동기": "구독 서비스의 재방문 전환에 주목" },
    manual: { "이전 팀장 이름": "김전임", "불발 사유": null },
  };

  it("fills every kind of slot and marks manual slots without a value", () => {
    const body = renderTemplate(
      "{{기업명}} {{AI:제안 동기}}하여 {{입력:이전 팀장 이름}} / {{입력:불발 사유}} / {{팀장 전화번호}}",
      values,
    );
    expect(body).toBe("모닝루프 구독 서비스의 재방문 전환에 주목하여 김전임 / [입력 필요: 불발 사유] / 010-1111-2222");
    expect(hasMissingInput("제목", body)).toBe(true);
    expect(hasMissingInput("제목", "빈칸 없는 본문")).toBe(false);
  });

  it("refuses to render when an auto or AI value is missing", () => {
    expect(() => renderTemplate("{{팀장 이름}}", values)).toThrow(MissingSlotError);
    expect(() => renderTemplate("{{AI:주제 아이디어}}", values)).toThrow(MissingSlotError);
  });
});

describe("template choice", () => {
  it("maps a work item to its case", () => {
    expect(templateKindOf({ candidateId: "c1", route: "new" })).toBe("new");
    expect(templateKindOf({ candidateId: null, route: "recontact" })).toBe("recontact");
    expect(templateKindOf({ candidateId: null, route: "alternate_contact" })).toBe("recontact");
    expect(templateKindOf({ candidateId: null, route: "repeat_collaboration" })).toBe("repeat_collaboration");
  });

  it("suggests the template that matches the previous outcome and skips empty ones", () => {
    const templates = [
      { id: "a", key: "recontact_no_reply", currentVersion: 1 },
      { id: "b", key: "recontact_discussed", currentVersion: 1 },
      { id: "c", key: null, currentVersion: 0 },
    ];
    const withFollowUp = [...templates, { id: "d", key: "recontact_follow_up", currentVersion: 1 }];
    expect(suggestTemplate(templates, { outcome: "unresolved" })?.id).toBe("a");
    expect(suggestTemplate(templates, { outcome: "rejected" })?.id).toBe("b");
    expect(suggestTemplate(templates, { outcome: "in_discussion" })?.id).toBe("b");
    expect(suggestTemplate(withFollowUp, { outcome: "rejected", hasRevisitCondition: true })?.id).toBe("d");
    expect(suggestTemplate(withFollowUp, { outcome: "rejected", hasRevisitCondition: false })?.id).toBe("b");
    expect(suggestTemplate(templates, null)?.id).toBe("a");
    expect(suggestTemplate(templates.slice(2), null)).toBeNull();
  });
});

// 마이그레이션에 넣은 초기 양식이 저장 검사를 통과하는지 확인한다(자동 입력 이름 오타 방지).
describe("seeded templates", () => {
  const sql = readFileSync(
    join(__dirname, "../../../../../../packages/db/migrations/20261117090000_message_templates/migration.sql"),
    "utf8",
  );
  const texts = [...sql.matchAll(/\$t\$([\s\S]*?)\$t\$/g)].map((match) => match[1] ?? "");
  const pair = (index: number) => [texts[index] ?? "", texts[index + 1] ?? ""] as const;

  it("uses only known auto fields and balanced braces", () => {
    expect(texts).toHaveLength(8);
    for (let index = 0; index < texts.length; index += 2)
      expect(templateProblems(...pair(index))).toEqual([]);
  });

  it("renders every seeded template with nothing left but manual-input marks", () => {
    const auto = Object.fromEntries(AUTO_FIELDS.map((field) => [field.name, field.sample]));
    for (let index = 0; index < texts.length; index += 2) {
      const [subject, body] = pair(index);
      const ai = Object.fromEntries(parseSlots(subject, body).ai.map((name) => [name, `(${name})`]));
      const rendered = renderTemplate(body, { auto, ai, manual: {} });
      expect(rendered).not.toContain("{{");
      expect(rendered).toContain("010-0000-0000");
      expect(hasMissingInput(rendered)).toBe(parseSlots(subject, body).manual.length > 0);
    }
  });

  it("has a default instruction for every AI slot", () => {
    const instructions = [...sql.matchAll(/\$j\$([\s\S]*?)\$j\$/g)].map((match) => Object.keys(JSON.parse(match[1] ?? "{}")));
    const aiSlots = [0, 2, 4].map((index) => parseSlots(...pair(index)).ai.sort());
    expect(instructions.map((names) => names.sort())).toEqual(aiSlots);
    expect(AUTO_FIELDS.map((field) => field.name)).toContain("팀장 전화번호");
  });
});
