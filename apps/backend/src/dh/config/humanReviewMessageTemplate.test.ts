import { describe, expect, it } from "vitest";
import { quarterSchedule } from "./humanReviewMessageTemplate";

describe("human review message schedule", () => {
  it("uses the selected Q1 and rolls kickoff back to the previous year", () => {
    expect(quarterSchedule(2027, 1)).toEqual({
      projectPeriod: "2027년 1~3월",
      kickoffSchedule: "2026년 12월 4주차~2027년 1월 1주차",
      midSchedule: "2027년 2월 1~2주차",
      finalSchedule: "2027년 3월 3~4주차",
      nextPeriod: "2027년 4~6월",
    });
  });
});
