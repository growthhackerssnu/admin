import { describe, expect, it, vi } from "vitest";
import { assertManualTransition, transitionOutcome } from "./outcome";

describe("manual outcome transitions", () => {
  it("records won or rejected from pending without a note", () => {
    expect(() => assertManualTransition("pending", "won", undefined)).not.toThrow();
    expect(() => assertManualTransition("pending", "rejected", undefined)).not.toThrow();
  });

  it("treats a never-recorded past send like pending", () => {
    expect(() => assertManualTransition(null, "won", undefined)).not.toThrow();
  });

  it("allows correcting an unresolved or finalized result only with a note", () => {
    for (const from of ["unresolved", "won", "rejected"] as const) {
      const to = from === "won" ? "rejected" : "won";
      expect(() => assertManualTransition(from, to, undefined)).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
      expect(() => assertManualTransition(from, to, "  ")).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
      expect(() => assertManualTransition(from, to, "전화로 확인")).not.toThrow();
    }
  });

  it("never lets a person set pending or unresolved, or repeat the same result", () => {
    expect(() => assertManualTransition("pending", "unresolved", "x")).toThrow(expect.objectContaining({ code: "STATE_CONFLICT" }));
    expect(() => assertManualTransition("won", "pending", "x")).toThrow(expect.objectContaining({ code: "STATE_CONFLICT" }));
    expect(() => assertManualTransition("won", "won", "x")).toThrow(expect.objectContaining({ code: "STATE_CONFLICT" }));
  });
});

describe("transitionOutcome", () => {
  const tx = (count: number) => ({
    outreach: { updateMany: vi.fn().mockResolvedValue({ count }) },
    outreachOutcomeEvent: { create: vi.fn().mockResolvedValue({ id: "e-1" }) },
  });
  const input = {
    outreachId: "o-1", expectedVersion: 3, from: "pending" as const, to: "won" as const,
    source: "manual" as const, actorId: "m-1", note: " 계약 ",
  };

  it("updates conditionally on the previous status and writes the event", async () => {
    const t = tx(1);
    await transitionOutcome(t as never, input);
    expect(t.outreach.updateMany).toHaveBeenCalledWith({
      where: { id: "o-1", version: 3, outcomeStatus: "pending" },
      data: { outcomeStatus: "won", version: { increment: 1 } },
    });
    expect(t.outreachOutcomeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromStatus: "pending", toStatus: "won", note: "계약", actorId: "m-1" }),
    });
  });

  it("does not write an event or overwrite when another change won the race", async () => {
    const t = tx(0);
    await expect(transitionOutcome(t as never, input)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(t.outreachOutcomeEvent.create).not.toHaveBeenCalled();
  });
});
