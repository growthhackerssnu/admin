// 홈페이지(ghsnu.com/PROJECT)에 공개된 프로젝트 소개 — 저장해 둔 복사본을 읽는다.
//
// 백서(Notion)는 내부 문서라 alumni는 본인이 참여한 것만 보지만, 홈페이지에 공개된 소개는
// 누구에게나 보여준다. 서버가 홈페이지를 주기적으로 읽지 않는다: 일회성 스크립트
// (npm run public-projects:import, scripts/hr/importPublicProjects.ts)가 한 번 복사해서
// ../data/publicProjects.json에 Notion 프로젝트 ID별로 저장하고, 이미지(썸네일·본문)도
// Supabase Storage로 옮겨둔다. 홈페이지가 바뀌면 스크립트를 다시 돌려 커밋한다.
import data from "../data/publicProjects.json";

// 홈페이지 상세 페이지 본문을 순서대로 줄인 형태.
export type PublicBlock =
  | { type: "heading"; text: string } // "프로젝트 소개"·"진행 프로세스"·"PM 소회" 같은 구역 제목
  | { type: "text"; text: string; bold?: true; list?: true; quote?: true }
  | { type: "image"; url: string };

export type PublicProjectRecord = {
  notionPageId: string;
  sourceUrl: string; // 원본 홈페이지 상세 페이지
  label: string; // 홈페이지 목록의 라벨, 예: "25-3Q Side | 1SelfWorld"
  nameKo: string | null;
  nameEn: string | null;
  headline: string[]; // 프로젝트 제목(여러 줄일 수 있음)
  thumbnailUrl: string | null; // 기업 로고(Storage 복사본)
  blocks: PublicBlock[];
};

export type PublicProjectsFile = {
  importedAt: string | null;
  projects: PublicProjectRecord[];
};

const byNotionId = new Map(
  (data as unknown as PublicProjectsFile).projects.map((p) => [p.notionPageId.replace(/-/g, ""), p]),
);

export function getPublicProject(notionPageId: string): PublicProjectRecord | undefined {
  return byNotionId.get(notionPageId.replace(/-/g, ""));
}
