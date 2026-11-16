import { describe, expect, it } from "vitest";
import type { Candidate } from "./contracts";
import { candidateStage, stageBadge } from "./stage";

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
