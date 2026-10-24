import type { Project } from "../api";

export interface ProjectFilters {
  search: string;
  quarters: string[];
  technologies: string[];
  mineOnly: boolean;
}

// 검색어는 제목(기업명)·한줄설명·홈페이지 제목·산업·기술·참여자 이름 중 하나에만 걸려도 통과한다.
// 공백은 무시한다(디렉토리 이름 검색과 같은 규칙). 필터는 항목 안에선 OR, 항목끼리는 AND.
export function matchesProject(
  project: Project,
  { search, quarters, technologies, mineOnly }: ProjectFilters,
): boolean {
  if (mineOnly && !project.isMine) return false;
  if (quarters.length > 0 && !quarters.includes(project.quarter ?? "")) {
    return false;
  }
  if (
    technologies.length > 0 &&
    !project.technology.some((t) => technologies.includes(t))
  ) {
    return false;
  }
  const query = normalize(search);
  if (!query) return true;
  return [
    project.title,
    project.oneLiner ?? "",
    project.publicTitle ?? "",
    ...project.industry,
    ...project.technology,
    ...project.members.map((m) => m.name),
  ].some((text) => normalize(text).includes(query));
}

function normalize(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}
