import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { readGenerated, templateFillPrompt } from "./templateGeneration";

describe("template fill prompt", () => {
  it("carries the section instructions and the owner intent as data", () => {
    const prompt = templateFillPrompt({
      templateSubject: "제목",
      templateBody: "{{AI:제안 동기}}하여",
      aiSections: [{ name: "제안 동기", instruction: "명사로 끝낸다" }],
      manualInputs: ["불발 사유"],
      ownerIntent: "리텐션 분석을 강조",
      company: { name: "모닝루프", product: null, domain: null },
      recipient: { name: "김민수", title: null, channel: "email" },
      targetQuarter: { year: 2027, quarter: 1 },
      research: null,
      pastProjects: [],
      history: null,
    });
    expect(prompt).toContain("명사로 끝낸다");
    expect(prompt).toContain("리텐션 분석을 강조");
    expect(prompt).toContain("Never guess");
  });
});

describe("reading the AI answer", () => {
  const answer = {
    topic: " 리텐션 분석 제안 ",
    sections: [{ name: "제안 동기", text: " 재방문 전환에 주목 " }],
    inputs: [{ name: "불발 사유", text: "" }, { name: "이전 팀장 이름", text: "김전임" }],
  };

  it("returns AI sections by name and leaves unknown manual inputs empty", () => {
    expect(readGenerated(answer, ["제안 동기"], ["불발 사유", "이전 팀장 이름"])).toEqual({
      topic: "리텐션 분석 제안",
      ai: { "제안 동기": "재방문 전환에 주목" },
      manual: { "불발 사유": null, "이전 팀장 이름": "김전임" },
    });
  });

  it("fails when an AI section is missing", () => {
    expect(() => readGenerated(answer, ["제안 동기", "주제 아이디어"], [])).toThrow("주제 아이디어");
  });
});
