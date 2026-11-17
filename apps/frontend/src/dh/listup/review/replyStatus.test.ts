import { describe, expect, it } from "vitest";
import {
  allowedReplyTransitions,
  replyNeedsConfirmation,
  replyNoteRequired,
  replyRecordBody,
  replyStatusLabels,
  replyTransitionError,
  revisitConditionApplies,
} from "./replyStatus";

describe("reply status rules", () => {
  it("offers every recordable status except the current one", () => {
    expect(allowedReplyTransitions("pending")).toEqual(["in_discussion", "won", "rejected"]);
    expect(allowedReplyTransitions(null)).toEqual(["in_discussion", "won", "rejected"]);
    expect(allowedReplyTransitions("in_discussion")).toEqual(["pending", "won", "rejected"]);
    expect(allowedReplyTransitions("unresolved")).toEqual(["pending", "in_discussion", "won", "rejected"]);
    expect(allowedReplyTransitions("won")).toEqual(["pending", "in_discussion", "rejected"]);
    expect(allowedReplyTransitions("rejected")).toEqual(["pending", "in_discussion", "won"]);
  });

  it("never requires a note", () => {
    for (const from of [null, "pending", "in_discussion", "unresolved", "won", "rejected"] as const)
      expect(replyNoteRequired(from)).toBe(false);
  });

  it("explains why a record is refused", () => {
    expect(replyTransitionError("pending", { result: "in_discussion" })).toBeNull();
    expect(replyTransitionError("won", { result: "rejected" })).toBeNull();
    expect(replyTransitionError("rejected", { result: "pending" })).toBeNull();
    expect(replyTransitionError("in_discussion", { result: "in_discussion" })).toContain("바꿀 수 없습니다");
    expect(replyTransitionError("pending", { result: "won", note: "가".repeat(2001) })).toContain("2000자");
    expect(replyTransitionError("pending", { result: "rejected", revisitCondition: "가".repeat(501) })).toContain("500자");
  });

  it("shows the revisit field for in-discussion and declined only, and confirms settled results", () => {
    expect(revisitConditionApplies("in_discussion")).toBe(true);
    expect(revisitConditionApplies("rejected")).toBe(true);
    expect(revisitConditionApplies("won")).toBe(false);
    expect(revisitConditionApplies("")).toBe(false);
    expect(replyNeedsConfirmation("in_discussion")).toBe(false);
    expect(replyNeedsConfirmation("won")).toBe(true);
    expect(replyNeedsConfirmation("rejected")).toBe(true);
  });

  it("sends trimmed values and drops empty or inapplicable ones", () => {
    expect(replyRecordBody({ result: "rejected", note: " 일정 문제 ", revisitCondition: " 내년 1분기 " }))
      .toEqual({ result: "rejected", note: "일정 문제", revisitCondition: "내년 1분기" });
    expect(replyRecordBody({ result: "won", note: "", revisitCondition: "내년 1분기" })).toEqual({ result: "won" });
  });

  it("labels every status in Korean", () => {
    expect(replyStatusLabels).toEqual({
      pending: "회신 대기", in_discussion: "논의 중", won: "수주", rejected: "기업 거절", unresolved: "무응답",
    });
  });
});
