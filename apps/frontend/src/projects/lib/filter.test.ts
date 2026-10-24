import { describe, expect, it } from "vitest";
import type { Project } from "../api";
import { groupByQuarter, matchesProject } from "./filter";

const project: Project = {
  notionPageId: "p1",
  title: "데이블 (25.2Q)",
  quarter: "25-2Q",
  oneLiner: "개인화 광고 추천",
  technology: ["추천시스템"],
  industry: ["광고"],
  members: [{ notionPageId: "m1", name: "김 민 주", cohort: 18, isPm: true }],
  thumbnailUrl: null,
  publicTitle: "LP 모델 효과 검증",
  isMine: false,
  canRead: false,
};

const none = { search: "", quarters: [], technologies: [], mineOnly: false };

describe("matchesProject", () => {
  it("passes everything without filters", () => {
    expect(matchesProject(project, none)).toBe(true);
  });

  it("searches title, one-liner, tags and member names ignoring spaces", () => {
    expect(matchesProject(project, { ...none, search: "데이 블" })).toBe(true);
    expect(matchesProject(project, { ...none, search: "광고 추천" })).toBe(
      true,
    );
    expect(matchesProject(project, { ...none, search: "김민주" })).toBe(true);
    expect(matchesProject(project, { ...none, search: "LP 모델" })).toBe(true);
    expect(matchesProject(project, { ...none, search: "볼라" })).toBe(false);
  });

  it("ANDs quarter, technology and mine-only filters", () => {
    expect(
      matchesProject(project, { ...none, quarters: ["25-2Q", "26-1Q"] }),
    ).toBe(true);
    expect(matchesProject(project, { ...none, quarters: ["26-1Q"] })).toBe(
      false,
    );
    expect(
      matchesProject(project, {
        ...none,
        quarters: ["25-2Q"],
        technologies: ["GEO"],
      }),
    ).toBe(false);
    expect(matchesProject(project, { ...none, mineOnly: true })).toBe(false);
    expect(
      matchesProject({ ...project, isMine: true }, { ...none, mineOnly: true }),
    ).toBe(true);
  });
});

describe("groupByQuarter", () => {
  const at = (id: string, quarter: string | null): Project => ({
    ...project,
    notionPageId: id,
    quarter,
  });

  it("keeps server order and puts projects without a quarter last", () => {
    const groups = groupByQuarter([
      at("a", "26-1Q"),
      at("x", null),
      at("b", "26-1Q"),
      at("c", "25-4Q"),
    ]);
    expect(
      groups.map((g) => [g.label, g.projects.map((p) => p.notionPageId)]),
    ).toEqual([
      ["2026년 1분기", ["a", "b"]],
      ["2025년 4분기", ["c"]],
      ["분기 미정", ["x"]],
    ]);
  });
});
