import { describe, expect, it } from "vitest";
import { FIT_INTERVENTION_AREAS } from "@/config/fitCriteria";
import { deriveFitVerdict, normalizeInterventions } from "./fitAssessment";

function interventions(
  overrides: Partial<{
    possibilityVerdict: "supported" | "unsupported" | "unknown";
    possibilityEvidenceIds: string[];
    valueVerdict: "supported" | "unsupported" | "unknown";
    valueEvidenceIds: string[];
  }> = {},
) {
  return FIT_INTERVENTION_AREAS.map((area) => ({
    area,
    possibilityVerdict: "unsupported" as const,
    possibilityReason: "근거상 해당 영역과 연결되지 않는다.",
    possibilityEvidenceIds: ["evidence-1"],
    prerequisites: [],
    valueVerdict: "unsupported" as const,
    valueReason: "근거상 사업 성과와 연결되지 않는다.",
    valueEvidenceIds: ["evidence-1"],
    targetBusinessOutcome: "해당 없음",
    ...overrides,
  }));
}

describe("fit assessment normalization", () => {
  it("requires all six intervention areas exactly once", () => {
    expect(() =>
      normalizeInterventions(interventions().slice(1), new Set(["evidence-1"])),
    ).toThrow("all intervention areas");
  });

  it("turns an unsupported conclusion without evidence into unknown", () => {
    const normalized = normalizeInterventions(
      interventions({ possibilityEvidenceIds: [] }),
      new Set(["evidence-1"]),
    );
    expect(normalized[0]?.possibilityVerdict).toBe("unknown");
    expect(deriveFitVerdict(normalized)).toBe("pending");
  });

  it("derives fit only when one area has supported possibility and value", () => {
    const normalized = normalizeInterventions(
      interventions({
        possibilityVerdict: "supported",
        valueVerdict: "supported",
      }),
      new Set(["evidence-1"]),
    );
    expect(deriveFitVerdict(normalized)).toBe("fit");
  });

  it("derives unfit when every evidence-backed criterion is unsupported", () => {
    const normalized = normalizeInterventions(
      interventions(),
      new Set(["evidence-1"]),
    );
    expect(deriveFitVerdict(normalized)).toBe("unfit");
  });
});
