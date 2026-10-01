import { describe, expect, it } from "vitest";
import { FIT_INTERVENTION_AREAS } from "@/dh/config/fitCriteria";
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

  it("downgrades blanket supported areas without an area-specific public signal", () => {
    const normalized = normalizeInterventions(
      interventions({
        possibilityVerdict: "supported",
        valueVerdict: "supported",
      }),
      new Set(["evidence-1"]),
      new Map([["evidence-1", "AI 기반 디지털 SaaS 서비스"]]),
    );

    expect(
      normalized.every(
        (item) =>
          item.possibilityVerdict === "unknown" &&
          item.valueVerdict === "unknown",
      ),
    ).toBe(true);
    expect(deriveFitVerdict(normalized)).toBe("pending");
  });

  it("keeps a supported consumer transaction signal in its matching area", () => {
    const raw = interventions();
    const first = raw[0]!;
    raw[0] = {
      ...first,
      possibilityVerdict: "supported",
      valueVerdict: "supported",
      possibilityEvidenceIds: ["evidence-user"],
      valueEvidenceIds: ["evidence-user"],
    };

    const normalized = normalizeInterventions(
      raw,
      new Set(["evidence-1", "evidence-user"]),
      new Map([
        [
          "evidence-user",
          "모바일 앱에서 회원이 예약과 결제를 완료하는 반복 서비스입니다.",
        ],
      ]),
    );

    expect(normalized[0]?.possibilityVerdict).toBe("supported");
    expect(normalized[0]?.valueVerdict).toBe("supported");
    expect(deriveFitVerdict(normalized)).toBe("fit");
  });

  it("keeps an evidence-backed game player signal in user analysis only", () => {
    const raw = interventions();
    raw[0] = {
      ...raw[0]!,
      possibilityVerdict: "supported",
      valueVerdict: "supported",
      possibilityEvidenceIds: ["evidence-game"],
      valueEvidenceIds: ["evidence-game"],
    };

    const normalized = normalizeInterventions(
      raw,
      new Set(["evidence-1", "evidence-game"]),
      new Map([
        [
          "evidence-game",
          "The studio develops a live-service game that players use repeatedly.",
        ],
      ]),
    );

    expect(normalized[0]?.possibilityVerdict).toBe("supported");
    expect(normalized[0]?.valueVerdict).toBe("supported");
    expect(
      normalized.slice(1).every((item) => item.possibilityVerdict !== "supported"),
    ).toBe(true);
  });

  it("derives unfit when every evidence-backed criterion is unsupported", () => {
    const normalized = normalizeInterventions(
      interventions(),
      new Set(["evidence-1"]),
    );
    expect(deriveFitVerdict(normalized)).toBe("unfit");
  });
});
