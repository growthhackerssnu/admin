import { describe, expect, it } from "vitest";
import { CLOSE_REASONS, COMPANY_STAGES, companyStage, type StageInput } from "./stage";

const collected: StageInput = {
  researchStatus: "queued",
  reviewStatus: "unreviewed",
  reviewOwnerId: null,
  autoExcludedAt: null,
  latestOutreach: null,
};
const researched: StageInput = { ...collected, researchStatus: "ready" };
const assigned: StageInput = { ...researched, reviewOwnerId: "member-1" };
const approved: StageInput = { ...assigned, reviewStatus: "approved" };
const sent: StageInput = {
  ...approved,
  latestOutreach: { sendStatus: "sent", outcomeStatus: "pending" },
};

describe("company stage", () => {
  it("follows the normal path from collection to a won deal", () => {
    expect(companyStage(collected).stage).toBe("researching");
    expect(companyStage(researched).stage).toBe("awaiting_assignment");
    expect(companyStage(assigned).stage).toBe("in_review");
    expect(companyStage({ ...assigned, reviewStatus: "reviewing" }).stage).toBe("in_review");
    expect(companyStage(approved).stage).toBe("preparing_send");
    expect(
      companyStage({ ...approved, latestOutreach: { sendStatus: "before_send", outcomeStatus: null } }).stage,
    ).toBe("preparing_send");
    expect(companyStage(sent).stage).toBe("awaiting_reply");
    expect(
      companyStage({ ...sent, latestOutreach: { sendStatus: "sent", outcomeStatus: "won" } }).stage,
    ).toBe("won");
  });

  it("reports research progress only while researching", () => {
    expect(companyStage(collected).researchProgress).toBe("waiting");
    expect(companyStage({ ...collected, researchStatus: null }).researchProgress).toBe("waiting");
    expect(companyStage({ ...collected, researchStatus: "running" }).researchProgress).toBe("running");
    expect(companyStage({ ...collected, researchStatus: "error" }).researchProgress).toBe("failed");
    expect(companyStage(researched).researchProgress).toBeNull();
  });

  it("goes back to researching when an assigned candidate is re-researched", () => {
    expect(companyStage({ ...assigned, researchStatus: "queued" })).toEqual({
      stage: "researching",
      closeReason: null,
      researchProgress: "waiting",
    });
  });

  it("closes with exactly one reason", () => {
    const closed = (input: StageInput) => companyStage(input);
    expect(closed({ ...collected, autoExcludedAt: new Date() }).closeReason).toBe("domain_excluded");
    expect(closed({ ...assigned, reviewStatus: "rejected_fit" }).closeReason).toBe("unfit");
    expect(closed({ ...assigned, reviewStatus: "rejected_contact" }).closeReason).toBe("no_contact");
    expect(
      closed({ ...sent, latestOutreach: { sendStatus: "sent", outcomeStatus: "rejected" } }).closeReason,
    ).toBe("company_declined");
    expect(
      closed({ ...sent, latestOutreach: { sendStatus: "sent", outcomeStatus: "unresolved" } }).closeReason,
    ).toBe("no_response");
  });

  it("keeps the sent state even if the review is reopened afterwards", () => {
    expect(companyStage({ ...sent, reviewStatus: "reviewing" }).stage).toBe("awaiting_reply");
  });

  it("treats a recorded outcome without a send status as sent (imported history)", () => {
    expect(
      companyStage({ ...approved, latestOutreach: { sendStatus: null, outcomeStatus: "pending" } }).stage,
    ).toBe("awaiting_reply");
  });

  it("returns one valid stage, and a close reason only when closed, for every field combination", () => {
    const researchStatuses = ["queued", "running", "ready", "error", null] as const;
    const reviewStatuses = ["unreviewed", "reviewing", "approved", "rejected_fit", "rejected_contact", null] as const;
    const sendStatuses = ["before_send", "sent", null] as const;
    const outcomeStatuses = ["pending", "won", "rejected", "unresolved", null] as const;
    const outreaches = [
      null,
      ...sendStatuses.flatMap((sendStatus) =>
        outcomeStatuses.map((outcomeStatus) => ({ sendStatus, outcomeStatus })),
      ),
    ];
    let checked = 0;
    for (const researchStatus of researchStatuses)
      for (const reviewStatus of reviewStatuses)
        for (const reviewOwnerId of ["member-1", null])
          for (const autoExcludedAt of [new Date(), null])
            for (const latestOutreach of outreaches) {
              const out = companyStage({ researchStatus, reviewStatus, reviewOwnerId, autoExcludedAt, latestOutreach });
              expect(COMPANY_STAGES).toContain(out.stage);
              expect(out.closeReason !== null).toBe(out.stage === "closed");
              if (out.closeReason) expect(CLOSE_REASONS).toContain(out.closeReason);
              expect(out.researchProgress !== null).toBe(out.stage === "researching");
              checked += 1;
            }
    expect(checked).toBe(5 * 6 * 2 * 2 * 16);
  });

  it("shows in discussion once a reply is recorded, until it is won or declined", () => {
    const sent = {
      researchStatus: "ready" as const,
      reviewStatus: "approved" as const,
      reviewOwnerId: "m1",
      autoExcludedAt: null,
    };
    const stageOf = (outcomeStatus: "pending" | "in_discussion" | "won" | "rejected") =>
      companyStage({ ...sent, latestOutreach: { sendStatus: "sent", outcomeStatus } }).stage;
    expect(stageOf("pending")).toBe("awaiting_reply");
    expect(stageOf("in_discussion")).toBe("in_discussion");
    expect(stageOf("won")).toBe("won");
    expect(stageOf("rejected")).toBe("closed");
  });
});
