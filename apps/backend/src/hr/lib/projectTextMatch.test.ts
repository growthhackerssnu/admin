import { describe, expect, it } from "vitest";
import { matchProjectLines, type MatchableProject } from "./projectTextMatch";

const ME = "me";
function project(id: string, title: string, quarter: string, mine = false): MatchableProject {
  return { notionPageId: id, title, quarter, members: mine ? [{ notionPageId: ME }] : [] };
}

const projects = [
  project("dable-24", "데이블 (24.4Q)", "24-4Q"),
  project("dable-25", "데이블 (25.2Q)", "25-2Q"),
  project("fasto", "파스토 (23.2Q)", "23-2Q"),
  project("fasto-self", "파스토셀프 (22.4Q)", "22-4Q"),
  project("hyundai", "현대홈쇼핑 (22.2Q)", "22-2Q"),
  project("rider", "라이더대시 (21.1Q)", "21-1Q", true),
  project("bly", "블리몽키즈 (25.1Q)", "25-1Q"),
  project("bly-s", "블리몽키즈 (25.1Q-S)", "25-1Q", true),
];

describe("matchProjectLines", () => {
  it("uses the line's dates to tell repeat clients apart", () => {
    const text = [
      "데이블 | LP 모델 검증 | 2025.03 ~ 2025.06",
      "- 데이블 | 광고 피로도 수치화 | 2024.09 ~ 2024.12",
    ].join("\n");
    expect(matchProjectLines(text, projects, "x")).toEqual(["dable-25", "dable-24"]);
  });

  it("prefers the longest company name", () => {
    expect(matchProjectLines("• 파스토셀프 | 이탈 방지 | 2022.09 ~ 2022.12", projects, "x")).toEqual(["fasto-self"]);
  });

  it("accepts a one-quarter mismatch between the profile and the DB", () => {
    expect(matchProjectLines("현대홈쇼핑 | 콜 수 예측 | 2022.01 ~ 2022.02", projects, "x")).toEqual(["hyundai"]);
  });

  it("leaves outside projects and far-off dates unlinked", () => {
    const text = [
      "RNN 기반 360 영상 Saliency map 예측 | 2022.03 ~ 2022.12",
      "농업 소득 증대를 위한 데이블 CSR 전략 수립 | 2018.07 ~ 2018.10",
      "데이블 인턴 경험을 바탕으로 한 회고 글",
    ].join("\n");
    expect(matchProjectLines(text, projects, "x")).toEqual([null, null, null]);
  });

  it("links an English company name through the person's own project in that quarter", () => {
    expect(matchProjectLines("Riderdash | UX 향상 | 2021.01 ~ 2021.02", projects, ME)).toEqual(["rider"]);
    expect(matchProjectLines("Riderdash | UX 향상 | 2021.01 ~ 2021.02", projects, "x")).toEqual([null]);
  });

  it("picks the person's own project when a main and side project share a quarter", () => {
    expect(matchProjectLines("블리몽키즈 | 물류창고 위치 | 2025.01 ~ 2025.02", projects, ME)).toEqual(["bly-s"]);
    expect(matchProjectLines("블리몽키즈 | 물류창고 위치 | 2025.01 ~ 2025.02", projects, "x")).toEqual(["bly"]);
  });

  it("keeps blank lines aligned", () => {
    expect(matchProjectLines("\n파스토 | 전환율 예측 | 2023.03 ~ 2023.06", projects, "x")).toEqual([null, "fasto"]);
  });
});
