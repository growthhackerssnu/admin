// 디렉토리(/hr) 화면의 정렬·필터·패싯 계산 — 전부 순수 함수라 화면 컴포넌트와
// 분리해뒀다. 규칙 출처는 ARCHITECTURE.md §12.2.
import type { PersonSummary } from "./api";

// Notion "직책" select의 실제 옵션 문자열 그대로(2026-09-28 라이브 조회로 확인,
// DB_SCHEMA_HR.md §2.1). 순서가 곧 디렉토리 기본 정렬 순서다 — 목록에 없으면
// (직책 없는 일반 회원) 맨 뒤로 취급.
const POSITION_ORDER = [
  "회장",
  "부회장",
  "총무 / 내부운영팀장",
  "대외협력팀장",
  "HR팀장",
  "교육팀장",
  "PR팀장",
] as const;

function positionRank(position: string | null): number {
  if (!position) return POSITION_ORDER.length;
  const idx = POSITION_ORDER.indexOf(position as (typeof POSITION_ORDER)[number]);
  return idx === -1 ? POSITION_ORDER.length : idx;
}

// 기본 정렬: 기수 내림차순 → 직책 순서 → 가나다순(§12.2, Notion 기본 뷰와 동일).
export function comparePeople(a: PersonSummary, b: PersonSummary): number {
  if (a.cohort !== b.cohort) return b.cohort - a.cohort;
  const positionDiff = positionRank(a.position) - positionRank(b.position);
  if (positionDiff !== 0) return positionDiff;
  return a.name.localeCompare(b.name, "ko");
}

// 값이 없는 사람을 묶는 필터 옵션의 내부 키. 화면엔 NONE_LABEL로 보여준다
// (어느 카테고리든 null/빈 배열이 있으면 자동으로 이 옵션이 생기는 공통
// 규칙, §12.2 "값 없음 처리").
export const NONE_KEY = "__NONE__";
export const NONE_LABEL = "값 없음";

export type FacetOption = { key: string; label: string; count: number };
export type Facets = {
  cohorts: FacetOption[];
  jobFields: FacetOption[];
  teams: FacetOption[];
};

function countBy(values: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

// count 내림차순으로 정렬하되, "값 없음"은 있으면 항상 맨 뒤로 보낸다.
function toSortedOptions(counts: Map<string, number>, labelFor: (key: string) => string): FacetOption[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: labelFor(key), count }))
    .sort((a, b) => {
      if (a.key === NONE_KEY) return 1;
      if (b.key === NONE_KEY) return -1;
      return b.count - a.count;
    });
}

export function computeFacets(people: PersonSummary[]): Facets {
  const cohortCounts = countBy(people.map((p) => String(p.cohort)));
  const jobFieldCounts = countBy(people.map((p) => p.jobField ?? NONE_KEY));
  const teamCounts = countBy(people.flatMap((p) => (p.team.length > 0 ? p.team : [NONE_KEY])));

  return {
    // 기수만 숫자 내림차순(최신 기수 먼저, 디렉토리 기본 정렬과 같은 방향) —
    // 나머지 두 카테고리는 count 내림차순이 더 유용하다(자주 고르는 값이 위로).
    cohorts: [...cohortCounts.entries()]
      .map(([key, count]) => ({ key, label: `${key}기`, count }))
      .sort((a, b) => Number(b.key) - Number(a.key)),
    jobFields: toSortedOptions(jobFieldCounts, (key) => (key === NONE_KEY ? NONE_LABEL : key)),
    teams: toSortedOptions(teamCounts, (key) => (key === NONE_KEY ? NONE_LABEL : key)),
  };
}

export type DirectoryFilters = {
  search: string;
  cohorts: Set<string>;
  jobFields: Set<string>;
  teams: Set<string>;
};

// 카테고리 안에서는 OR(체크한 것 중 하나라도 맞으면 포함), 카테고리 사이는
// AND(전부 만족해야 함) — 패싯 검색의 표준 동작(§12.2).
export function matchesFilters(person: PersonSummary, filters: DirectoryFilters): boolean {
  const search = filters.search.trim();
  if (search && !person.name.includes(search)) return false;

  if (filters.cohorts.size > 0 && !filters.cohorts.has(String(person.cohort))) return false;

  if (filters.jobFields.size > 0) {
    const key = person.jobField ?? NONE_KEY;
    if (!filters.jobFields.has(key)) return false;
  }

  if (filters.teams.size > 0) {
    const personTeams = person.team.length > 0 ? person.team : [NONE_KEY];
    if (!personTeams.some((t) => filters.teams.has(t))) return false;
  }

  return true;
}
