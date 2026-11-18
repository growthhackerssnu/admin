import { describe, expect, it } from "vitest";
import { quarterSchedule } from "./humanReviewMessageTemplate";

describe("human review message schedule", () => {
  it("runs Q1 over winter break: two months, no interim, final in February", () => {
    expect(quarterSchedule(2027, 1)).toEqual({
      projectPeriod: "2027년 1~2월",
      kickoffSchedule: "2026년 12월 4주차~2027년 1월 1주차",
      midSchedule: null,
      finalSchedule: "2027년 2월 3~4주차",
      nextPeriod: "2027년 4~6월",
    });
  });

  it("keeps the interim presentation in semester quarters", () => {
    expect(quarterSchedule(2027, 2)).toEqual({
      projectPeriod: "2027년 4~6월",
      kickoffSchedule: "2027년 3월 4주차~2027년 4월 1주차",
      midSchedule: "2027년 5월 1~2주차",
      finalSchedule: "2027년 6월 3~4주차",
      nextPeriod: "2027년 7~8월",
    });
  });

  it("runs Q3 over summer break with the final in August", () => {
    const q3 = quarterSchedule(2027, 3);
    expect(q3.midSchedule).toBeNull();
    expect(q3.finalSchedule).toBe("2027년 8월 3~4주차");
    expect(q3.projectPeriod).toBe("2027년 7~8월");
  });

  it("rolls Q4's next period into the next year's winter break", () => {
    expect(quarterSchedule(2027, 4).nextPeriod).toBe("2028년 1~2월");
  });
});
