import { describe, expect, it } from "vitest";
import { applyCommand } from "./previewRepository";
import { initialReviewData } from "./fixtures";
import {
  canCopy,
  currentActor,
  validRecipient,
  type CandidateCommand,
  type ReviewData,
} from "./contracts";

const recipient = {
  name: "테스트 관계자",
  title: "사업개발",
  channel: "linkedin" as const,
  address: "https://www.linkedin.com/in/example-review-person",
};
function sequence(...commands: CandidateCommand[]) {
  let data = initialReviewData();
  for (const command of commands)
    data = applyCommand(
      data,
      "morningloop",
      data.candidates[0].version,
      command,
    );
  return data;
}
function next(data: ReviewData, command: CandidateCommand) {
  return applyCommand(data, "morningloop", data.candidates[0].version, command);
}
const approved = () =>
  sequence(
    { type: "claim" },
    { type: "contact", recipient },
    { type: "decide", status: "approved", note: "자료 확인" },
  );
const draft = () =>
  next(next(approved(), { type: "quarter", quarter: "2027-Q1" }), {
    type: "generate",
  });

describe("human review workflow", () => {
  it("does not approve without a saved contact", () => {
    expect(() =>
      sequence(
        { type: "claim" },
        { type: "decide", status: "approved", note: "" },
      ),
    ).toThrow("관계자");
  });
  it("keeps fit when a person rejects for lack of contacts", () => {
    const item = sequence(
      { type: "claim" },
      { type: "decide", status: "rejected_contact", note: "찾지 못함" },
    ).candidates[0];
    expect(item.decisions[0]).toMatchObject({
      fit: "fit",
      contact: "not_found",
      actor: currentActor,
    });
    expect(item.reviewStatus).toBe("rejected_contact");
  });
  it("requires human approval and a quarter, without any AI fit field", () => {
    expect(() => next(approved(), { type: "generate" })).toThrow("분기");
    const data = draft();
    expect(data.candidates[0].draft?.body).toContain("2027년 1~3월");
    expect(data.candidates[0].draft?.body).toContain(recipient.name);
    expect(data.candidates[0]).not.toHaveProperty("latestSystemAssessment");
  });
  it("blocks stale draft approval after quarter change", () => {
    const data = next(next(draft(), { type: "approveDraft" }), {
      type: "quarter",
      quarter: "2026-Q4",
    });
    expect(canCopy(data.candidates[0])).toBe(false);
    expect(() => next(data, { type: "approveDraft" })).toThrow("다시 생성");
  });
  it("requires confirmation after editing and blocks duplicate completion", () => {
    let data = next(draft(), { type: "approveDraft" });
    data = next(data, {
      type: "saveDraft",
      subject: "수정 제목",
      body: "수정 본문",
    });
    expect(canCopy(data.candidates[0])).toBe(false);
    data = next(next(data, { type: "approveDraft" }), { type: "send" });
    expect(() => next(data, { type: "send" })).toThrow("이미");
  });
  it("preserves sent snapshots when review and recipient change", () => {
    let data = next(next(draft(), { type: "approveDraft" }), { type: "send" });
    const sent = structuredClone(data.candidates[0].sent);
    data = next(data, {
      type: "contact",
      recipient: { ...recipient, name: "다른 사람" },
    });
    data = next(data, { type: "reopen" });
    expect(data.candidates[0].sent).toEqual(sent);
    expect(canCopy(data.candidates[0])).toBe(false);
  });
  it("adds and selects saved contacts without reusing a stale draft", () => {
    const another = { ...recipient, name: "두 번째 관계자", address: "https://www.linkedin.com/in/another-person" };
    let data = next(draft(), { type: "contact", recipient: another, mode: "add" });
    expect(data.candidates[0].contacts).toHaveLength(2);
    expect(data.candidates[0].recipient).toEqual(another);
    expect(canCopy(data.candidates[0])).toBe(false);
    data = next(data, { type: "selectContact", index: 0 });
    expect(data.candidates[0].recipient).toEqual(recipient);
  });
  it("records the first editor on save without a separate start", () => {
    const initial = initialReviewData();
    const saved = next(initial, { type: "contact", recipient });
    expect(saved.candidates[0].owner).toEqual(currentActor);
    expect(saved.candidates[0].reviewStatus).toBe("reviewing");
    expect(initial.candidates[0].owner).toBeFalsy();
    expect(() => applyCommand(saved, "morningloop", 1, { type: "contact", recipient })).toThrow("다른 변경");
    const rejected = next(initial, { type: "decide", status: "rejected_fit", note: "" });
    expect(rejected.candidates[0].owner).toEqual(currentActor);
    expect(rejected.candidates[0].reviewStatus).toBe("rejected_fit");
  });
  it("checks ownership and optimistic concurrency", () => {
    expect(() =>
      applyCommand(initialReviewData(), "localpass", 1, { type: "claim" }),
    ).toThrow("다른 담당자");
    expect(() =>
      applyCommand(approved(), "morningloop", 1, { type: "reopen" }),
    ).toThrow("다른 변경");
  });
  it("retry does not turn research failure into a review decision", () => {
    const data = applyCommand(initialReviewData(), "foldmarket", 1, {
      type: "retry",
    });
    expect(data.candidates[2]).toMatchObject({
      researchStatus: "queued",
      reviewStatus: "unreviewed",
      decisions: [],
      error: null,
    });
    expect(() =>
      applyCommand(data, "foldmarket", 2, { type: "claim" }),
    ).toThrow("조사가 완료");
  });
  it("accepts only an actual LinkedIn profile URL or email", () => {
    expect(validRecipient(recipient)).toBe(true);
    expect(
      validRecipient({
        ...recipient,
        address: "https://linkedin.com.evil.test/in/person",
      }),
    ).toBe(false);
    expect(
      validRecipient({
        ...recipient,
        address: "https://www.linkedin.com/search/results/people/",
      }),
    ).toBe(false);
    expect(
      validRecipient({
        ...recipient,
        channel: "email",
        address: "person@company.example",
      }),
    ).toBe(true);
  });
});
