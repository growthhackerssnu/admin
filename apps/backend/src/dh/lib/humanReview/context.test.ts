import { describe, expect, it, vi } from "vitest";
import { draftContextMismatch, loadOutreachContext, type ContextOutreach } from "./context";
import { buildCurrentWork } from "./currentWork";

const recontact: ContextOutreach = {
  id: "o-new", companyId: "c-1", contactPurpose: "재협업 제안",
  recipientContactId: "contact-1", recipientEndpointId: "endpoint-1",
  currentTargetQuarterId: "q-1", acquisitionRoundId: "round-2", candidate: null,
};

const tx = (priorSentIds: string[], researchId: string | null = null, projects: { id: string; version: number }[] = []) => ({
  pastProject: {
    findMany: vi.fn().mockResolvedValue(projects.map((project) => ({
      ...project, title: "프로젝트", year: 2026, quarter: 3, status: "completed", summary: null, resultUrl: null,
    }))),
  },
  companyResearch: { findFirst: vi.fn().mockResolvedValue(researchId ? { id: researchId } : null) },
  outreach: {
    findMany: vi.fn().mockResolvedValue(priorSentIds.map((id) => ({
      id: `o-${id}`, acquisitionRoundId: "round-1",
      sentMessages: [{ id, sentAt: new Date("2026-07-01T00:00:00Z"), channel: "email", recipientNameSnapshot: "김", subjectSnapshot: "s", bodySnapshot: "b" }],
      responses: [], outcomeEvents: [],
    }))),
  },
});

describe("outreach context", () => {
  it("has no candidate research or review for a recontact, so a fresh draft matches", async () => {
    const ctx = await loadOutreachContext(tx(["sent-1"]) as never, recontact);
    expect(ctx).toMatchObject({ researchId: null, reviewDecisionId: null, hasEvidence: true });
    const draft = {
      generationResearchId: null, generationReviewDecisionId: null, recipientContactId: "contact-1",
      recipientEndpointId: "endpoint-1", targetQuarterId: "q-1", contactPurposeSnapshot: "재협업 제안",
      generationHistory: ctx.history,
    };
    expect(draftContextMismatch(draft, recontact, ctx)).toEqual([]);
  });

  it("reports history_changed when a new earlier send appears after generation", async () => {
    const before = await loadOutreachContext(tx(["sent-1"]) as never, recontact);
    const after = await loadOutreachContext(tx(["sent-1", "sent-2"]) as never, recontact);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    const draft = {
      generationResearchId: null, generationReviewDecisionId: null, recipientContactId: "contact-1",
      recipientEndpointId: "endpoint-1", targetQuarterId: "q-1", contactPurposeSnapshot: "재협업 제안",
      generationHistory: before.history,
    };
    expect(draftContextMismatch(draft, recontact, after)).toEqual(["history_changed"]);
  });

  it("uses stored projects as evidence and flags a draft whose project was edited afterwards", async () => {
    const before = await loadOutreachContext(tx([], null, [{ id: "p-1", version: 1 }]) as never, recontact);
    expect(before.hasEvidence).toBe(true);
    expect(before.history?.projects).toHaveLength(1);
    const edited = await loadOutreachContext(tx([], null, [{ id: "p-1", version: 2 }]) as never, recontact);
    expect(edited.fingerprint).not.toBe(before.fingerprint);
    const draft = {
      generationResearchId: null, generationReviewDecisionId: null, recipientContactId: "contact-1",
      recipientEndpointId: "endpoint-1", targetQuarterId: "q-1", contactPurposeSnapshot: "재협업 제안",
      generationHistory: before.history,
    };
    expect(draftContextMismatch(draft, recontact, edited)).toEqual(["history_changed"]);
  });

  it("changes the fingerprint when the purpose or round changes", async () => {
    const base = await loadOutreachContext(tx(["sent-1"]) as never, recontact);
    const purpose = await loadOutreachContext(tx(["sent-1"]) as never, { ...recontact, contactPurpose: "다른 목적" });
    const round = await loadOutreachContext(tx(["sent-1"]) as never, { ...recontact, acquisitionRoundId: "round-3" });
    expect(new Set([base.fingerprint, purpose.fingerprint, round.fingerprint]).size).toBe(3);
  });

  it("has no evidence when the company was never sent anything and has no stored research", async () => {
    const ctx = await loadOutreachContext(tx([]) as never, recontact);
    expect(ctx.hasEvidence).toBe(false);
  });

  it("keeps candidate-backed outreaches on the candidate's research and decision", async () => {
    const ctx = await loadOutreachContext(tx([]) as never, {
      ...recontact,
      candidate: { reviewStatus: "approved", currentResearchId: "r-1", activeReviewDecisionId: "d-1" },
    });
    expect(ctx).toMatchObject({ researchId: "r-1", reviewDecisionId: "d-1", history: null, hasEvidence: true });
  });
});

describe("current work", () => {
  const row = {
    id: "o-1", ownerId: "m-1", owner: { id: "m-1", displayName: "민준" }, sendStatus: "before_send" as const,
    outcomeStatus: null, acquisitionRound: { endedAt: null }, candidateId: null, contactPurpose: "목적",
    recipientContactId: "c", recipientEndpointId: "e",
  };

  it("lets the owner edit and generate in an open round", () => {
    expect(buildCurrentWork(row, "m-1", true)).toMatchObject({ canEdit: true, canGenerate: true, blockReasons: [] });
  });

  it("is read-only for someone else, after sending, and in a closed or missing round", () => {
    expect(buildCurrentWork(row, "m-2").blockReasons).toContain("not_owner");
    expect(buildCurrentWork({ ...row, sendStatus: "sent" }, "m-1").blockReasons).toContain("already_sent");
    expect(buildCurrentWork({ ...row, acquisitionRound: { endedAt: new Date() } }, "m-1").canEdit).toBe(false);
    expect(buildCurrentWork({ ...row, acquisitionRound: null }, "m-1").blockReasons).toContain("round_closed");
  });

  it("requires a written purpose, a recipient and evidence to generate a recontact", () => {
    const work = buildCurrentWork({ ...row, contactPurpose: "  ", recipientContactId: null }, "m-1", false);
    expect(work.canEdit).toBe(true);
    expect(work.canGenerate).toBe(false);
    expect(work.blockReasons).toEqual(["purpose_missing", "recipient_missing", "evidence_missing"]);
  });

  it("does not require a purpose for candidate-backed work", () => {
    expect(buildCurrentWork({ ...row, candidateId: "cand", contactPurpose: null }, "m-1", true).blockReasons).toEqual([]);
  });
});
