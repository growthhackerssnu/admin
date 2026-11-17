import { describe, expect, it, vi } from "vitest";
import { assertManualTransition, transitionOutcome } from "./outcome";

describe("manual outcome transitions", () => {
  const statuses = ["pending", "in_discussion", "won", "rejected", "unresolved"] as const;

  it("lets a person change a sent work item to any other recordable status", () => {
    for (const from of [null, ...statuses])
      for (const to of ["pending", "in_discussion", "won", "rejected"] as const) {
        const same = (from ?? "pending") === to;
        if (same) expect(() => assertManualTransition(from, to)).toThrow();
        else expect(() => assertManualTransition(from, to)).not.toThrow();
      }
  });

  it("never lets a person set unresolved", () => {
    for (const from of [null, ...statuses]) expect(() => assertManualTransition(from, "unresolved")).toThrow();
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
