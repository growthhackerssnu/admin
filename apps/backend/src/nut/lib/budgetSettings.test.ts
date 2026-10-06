import { describe, expect, it } from "vitest";
import { evaluateFormula, parameterValues } from "./financeRepository";

// 2026 하반기 내부운영 시트 '예산안'·'진행안'의 값. 설정을 옮긴 뒤에도 같은 예산이 나와야 한다.
const sheet = parameterValues(
  Object.entries({
    "business-19": 6, "business-20": 5, "hr-19": 6, "hr-20": 5, "pr-19": 3, "pr-20": 3,
    "summer-interns": 1, "summer-teams": 3, "next-teams": 5,
    "summer-support-per-person": 80000, "summer-tech-per-month": 130000, "summer-tech-months": 2, "side-project-tech": 100000,
    "next-support-per-person": 130000, "next-tech-per-month": 150000, "next-tech-months": 3,
    "ops-support-per-person": 30000, "uniform-per-person": 50000, "mentoring-per-person": 25000,
    "rookie-per-person": 20000, "event-per-person": 20000,
    "usd-krw": 1500, "slack-usd-per-seat": 8.75, "slack-months-19": 4.5, "slack-months-20": 3,
    "gsuite-usd-per-month": 15.84, "gsuite-months": 6,
  }).map(([id, value]) => ({ id, value })),
);

describe("budget settings", () => {
  it("derives totals from team headcounts like the sheet", () => {
    expect(sheet.get("cohort-19")).toBe(15);
    expect(sheet.get("cohort-20")).toBe(13);
    expect(sheet.get("summer-participants")).toBe(14);
    expect(sheet.get("next-participants")).toBe(28);
  });

  it.each([
    ["round(slack-usd-per-seat * usd-krw * (cohort-19 * slack-months-19 + cohort-20 * slack-months-20) / 10000) * 10000", 1400000],
    ["gsuite-usd-per-month * gsuite-months * usd-krw", 142560],
    ["summer-tech-per-month * summer-tech-months * summer-teams + side-project-tech", 880000],
    ["next-support-per-person * next-participants", 3640000],
    ["ops-support-per-person * (hr-19 * 2 + hr-20)", 510000],
    ["event-per-person * ceil((cohort-19 + cohort-20) / 2)", 280000],
  ])("%s = %i", (formula, expected) => {
    expect(evaluateFormula(formula, sheet)).toBe(expected);
  });

  it("changing a team headcount flows into the totals", () => {
    const more = parameterValues([...sheet].filter(([id]) => !id.startsWith("cohort") && !id.endsWith("participants")).map(([id, value]) => ({ id, value: id === "hr-20" ? 6 : value })));
    expect(more.get("cohort-20")).toBe(14);
    expect(more.get("next-participants")).toBe(29);
  });
});
