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

  it("treats internal delivery details as follow-up questions, not fit gates", () => {
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("원천 데이터 접근 권한");
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("fit의 필수 조건이 아니다");
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("2개월 안에 함께 구체화");
  });

  it("requires direct, area-specific public signals instead of broad AI or SaaS inference", () => {
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("서로 독립적으로 판단한다");
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("AI 기업이라는 사실은 모든 영역의 근거가 아니다");
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("내부 모델 자동 라우팅");
    expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain("명확한 모델 목표");
  });

  it("exposes the six stable intervention areas used by every assessment", () => {
    expect(FIT_INTERVENTION_AREAS).toHaveLength(6);
    expect(new Set(FIT_INTERVENTION_AREAS)).toHaveLength(6);
    FIT_INTERVENTION_AREAS.forEach((area) =>
      expect(FIT_CRITERIA_SYSTEM_PROMPT).toContain(area),
    );
  });
});
