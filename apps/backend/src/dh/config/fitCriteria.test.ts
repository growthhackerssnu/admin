import { describe, expect, it } from "vitest";
import {
  FIT_CRITERIA_SYSTEM_PROMPT,
  FIT_INTERVENTION_AREAS,
  FIT_CRITERIA_VERSION,
  getFitCriteriaSnapshot,
} from "./fitCriteria";

describe("fit criteria snapshot", () => {
  it("stores the exact prompt with a version and content hash", () => {
    const snapshot = getFitCriteriaSnapshot();

    expect(snapshot.version).toBe(FIT_CRITERIA_VERSION);
    expect(snapshot.systemPrompt).toBe(FIT_CRITERIA_SYSTEM_PROMPT);
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("contains the two-month scope without using headcount as a criterion", () => {
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("최대 2개월");
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain(
      "투입 인원은 판단 요소가 아니다",
    );
  });

  it("exposes the six stable intervention areas used by every assessment", () => {
    expect(FIT_INTERVENTION_AREAS).toHaveLength(6);
    expect(new Set(FIT_INTERVENTION_AREAS)).toHaveLength(6);
    FIT_INTERVENTION_AREAS.forEach((area) =>
      expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain(area),
    );
  });
});
