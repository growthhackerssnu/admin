import { describe, expect, it } from "vitest";
import type { Candidate } from "./contracts";
import { candidateReplyStatus, candidateStage, stageBadge, stageLabels } from "./stage";

const base: Candidate = {
  id: "c1", name: "가나테크", summary: "", website: "", discoveredAt: "2026-11-01T00:00:00Z",
  source: "TIPS", sourceUrl: "", researchStatus: "ready", research: null, error: null,
  owner: null, reviewStatus: "unreviewed", decisions: [], recipient: null, quarter: null,
  draft: null, sent: [], version: 1,
};

describe("candidate stage", () => {
  it("uses the stage the server calculated over the local fields", () => {
    const candidate: Candidate = {
      ...base,
      reviewStatus: "approved",
      stage: { stage: "closed", closeReason: "company_declined", researchProgress: null },
    };
    expect(candidateStage(candidate).stage).toBe("closed");
    expect(stageBadge(candidate)).toEqual({ label: "기업 거절", tone: "neutral" });
  });

  it("falls back to the local fields when the server sends no stage", () => {
    expect(candidateStage(base).stage).toBe("awaiting_assignment");
    expect(candidateStage({ ...base, owner: { id: "m1", name: "팀원" } }).stage).toBe("in_review");
    expect(candidateStage({ ...base, reviewStatus: "approved" }).stage).toBe("preparing_send");
    expect(candidateStage({ ...base, reviewStatus: "rejected_contact" })).toEqual({
      stage: "closed", closeReason: "no_contact", researchProgress: null,
    });
  });

  it("places in-discussion between awaiting reply and won", () => {
    const stages = Object.keys(stageLabels);
    expect(stages.indexOf("in_discussion")).toBe(stages.indexOf("awaiting_reply") + 1);
    expect(stages.indexOf("won")).toBe(stages.indexOf("in_discussion") + 1);
    expect(stageBadge({
      ...base, stage: { stage: "in_discussion", closeReason: null, researchProgress: null },
    })).toEqual({ label: "논의 중", tone: "info" });
  });

  it("follows the recorded reply status when the server sends no stage", () => {
    const sent = { ...base, reviewStatus: "approved" as const, sent: [{} as Candidate["sent"][number]] };
    expect(candidateStage(sent).stage).toBe("awaiting_reply");
    expect(candidateStage({ ...sent, outcomeStatus: "in_discussion" }).stage).toBe("in_discussion");
    expect(candidateStage({ ...sent, outcomeStatus: "won" }).stage).toBe("won");
    expect(stageBadge({ ...sent, outcomeStatus: "rejected" })).toEqual({ label: "기업 거절", tone: "neutral" });
    expect(stageBadge({ ...sent, outcomeStatus: "unresolved" })).toEqual({ label: "무응답", tone: "neutral" });
  });

  it("reads the reply status from the work detail first, then from the stage", () => {
    const staged = (stage: NonNullable<Candidate["stage"]>["stage"], closeReason: NonNullable<Candidate["stage"]>["closeReason"] = null): Candidate =>
      ({ ...base, stage: { stage, closeReason, researchProgress: null } });
    expect(candidateReplyStatus(base)).toBeNull();
    expect(candidateReplyStatus(staged("awaiting_reply"))).toBe("pending");
    expect(candidateReplyStatus(staged("in_discussion"))).toBe("in_discussion");
    expect(candidateReplyStatus(staged("closed", "company_declined"))).toBe("rejected");
    expect(candidateReplyStatus(staged("closed", "no_response"))).toBe("unresolved");
    expect(candidateReplyStatus(staged("closed", "unfit"))).toBeNull();
    expect(candidateReplyStatus({ ...staged("awaiting_reply"), outcomeStatus: "won" })).toBe("won");
  });

  it("shows research progress on the badge while researching", () => {
    expect(stageBadge({ ...base, researchStatus: "queued" })).toEqual({ label: "조사 대기", tone: "info" });
    expect(stageBadge({ ...base, researchStatus: "running" })).toEqual({ label: "조사 중", tone: "info" });
    expect(stageBadge({ ...base, researchStatus: "error" })).toEqual({ label: "재시도 필요", tone: "danger" });
  });

  it("shows the close reason on the badge when closed", () => {
    expect(stageBadge({ ...base, reviewStatus: "rejected_fit" })).toEqual({ label: "부적합", tone: "danger" });
    expect(stageBadge({ ...base, reviewStatus: "rejected_contact" })).toEqual({ label: "연락처 없음", tone: "warning" });
  });
});
