import { describe, expect, it } from "vitest";
import type { PersonSummary } from "./api";
import { computeFacets, groupByCohort, matchesFilters, NONE_KEY } from "./directory";

function person(overrides: Partial<PersonSummary>): PersonSummary {
  return {
    notionPageId: "id",
    name: "이름",
    cohort: 19,
    department: [],
    jobField: [],
    team: [],
    position: null,
    currentCareerOneLine: null,
    linkedin: null,
    profileImageUrl: null,
    ...overrides,
  };
}

const noFilters = {
  search: "",
  cohorts: new Set<string>(),
  jobFields: new Set<string>(),
  departments: new Set<string>(),
  teams: new Set<string>(),
};

describe("직무 계열 다중 선택 패싯", () => {
  const people = [
    person({ notionPageId: "a", jobField: ["PM", "DS"] }),
    person({ notionPageId: "b", jobField: ["PM"] }),
    person({ notionPageId: "c", jobField: [] }),
  ];

  it("여러 계열인 사람은 각 계열에 모두 센다, 값 없으면 '값 없음'", () => {
    const counts = Object.fromEntries(computeFacets(people).jobFields.map((o) => [o.key, o.count]));
    expect(counts).toEqual({ PM: 2, DS: 1, [NONE_KEY]: 1 });
  });

  it("체크한 값 중 하나라도 가지면 포함(OR)", () => {
    const filters = { ...noFilters, jobFields: new Set(["DS"]) };
    expect(people.filter((p) => matchesFilters(p, filters)).map((p) => p.notionPageId)).toEqual(["a"]);
  });

  it("'값 없음' 필터는 빈 배열인 사람만", () => {
    const filters = { ...noFilters, jobFields: new Set([NONE_KEY]) };
    expect(people.filter((p) => matchesFilters(p, filters)).map((p) => p.notionPageId)).toEqual(["c"]);
  });
});

describe("학과 다중 선택 패싯(직무 계열과 같은 규칙)", () => {
  const people = [
    person({ notionPageId: "a", department: ["경영학과", "컴퓨터공학부"] }),
    person({ notionPageId: "b", department: ["경영학과"] }),
    person({ notionPageId: "c", department: [] }),
  ];

  it("복수전공은 각 학과에 모두 센다, 값 없으면 '값 없음'", () => {
    const counts = Object.fromEntries(computeFacets(people).departments.map((o) => [o.key, o.count]));
    expect(counts).toEqual({ 경영학과: 2, 컴퓨터공학부: 1, [NONE_KEY]: 1 });
  });

  it("체크한 학과 중 하나라도 가지면 포함하고, 다른 패싯과는 AND", () => {
    const filters = { ...noFilters, departments: new Set(["컴퓨터공학부", NONE_KEY]) };
    expect(people.filter((p) => matchesFilters(p, filters)).map((p) => p.notionPageId)).toEqual(["a", "c"]);
    const both = { ...filters, cohorts: new Set(["20"]) };
    expect(people.filter((p) => matchesFilters(p, both))).toEqual([]);
  });
});

describe("groupByCohort", () => {
  it("정렬된 순서를 유지하며 기수별로 묶는다", () => {
    const groups = groupByCohort([
      person({ notionPageId: "1", cohort: 20 }),
      person({ notionPageId: "2", cohort: 19 }),
      person({ notionPageId: "3", cohort: 19 }),
    ]);
    expect(groups.map((g) => [g.cohort, g.people.map((p) => p.notionPageId)])).toEqual([
      [20, ["1"]],
      [19, ["2", "3"]],
    ]);
  });

  it("빈 목록이면 빈 배열", () => {
    expect(groupByCohort([])).toEqual([]);
  });
});
