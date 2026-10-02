import { describe, expect, it } from "vitest";
import {
  HUMAN_REVIEW_BODY,
  quarterSchedule,
} from "./humanReviewMessageTemplate";
import { renderOutreachTemplate } from "@/dh/lib/outreachDraft";

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

  it("fills the leader and selected quarter instead of retaining the old fixed dates", () => {
    const body = renderOutreachTemplate(HUMAN_REVIEW_BODY, {
      companyName: "모닝루프",
      recipientGreeting: "모닝루프 김서연 팀장님",
      recipientReference: "김서연님",
      companyWithWaGwa: "모닝루프와",
      collaborationExamples: "슈퍼센트 등 다양한",
      motivation: "공개 제품 사용 흐름을 살펴보았으며",
      projectIdeas: "- 사용자 여정 분석\n- 전환 분석\n- 운영 지표 설계",
      leadName: "김팀장",
      ...quarterSchedule(2027, 1),
    });
    expect(body).toContain("대외협력팀장 김팀장입니다.");
    expect(body).toContain("2027년 1~3월");
    expect(body).not.toContain("2026년 10-12월");
  });
});
