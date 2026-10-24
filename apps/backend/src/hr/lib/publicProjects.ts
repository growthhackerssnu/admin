// 공개 홈페이지(ghsnu.com/PROJECT)의 프로젝트 소개.
//
// 백서(Notion)는 내부 문서라 alumni는 본인이 참여한 것만 보지만, 홈페이지에 공개된
// 소개(기업명·프로젝트 제목·프로젝트 소개·세부 목표·기업 로고)는 누구에게나 보여준다.
// 홈페이지는 사이트 빌더로 만든 HTML이라 API가 없어서, 목록 페이지와 프로젝트별 상세
// 페이지를 받아 글자를 뽑는다. 상세 페이지는 줄마다 <div> 하나라서 줄 단위로 읽는다:
//   "워프스페이스 | WARPSPACE"   ← 기업명(국문 | 영문)
//   "캐릭터 개인화 추천 알고리즘 설계" ← 프로젝트 제목(여러 줄일 수 있음)
//   "프로젝트 소개" → 소개 문단들
//   "세부 목표:"   → 번호 목록(다음 섹션 제목 전까지)
// 홈페이지엔 24-4Q 이후 프로젝트만 있다(2026-10 기준 26건).
//
// 캐시는 백서와 같은 people_cache 테이블의 "public-projects" 키(6시간). 홈페이지가
// 안 열리면 빈 목록으로 넘어간다 — 공개 소개가 없을 뿐 백서 화면은 떠야 한다.

const SITE = "https://ghsnu.com";
const LIST_PATH = "/PROJECT";
const FETCH_TIMEOUT_MS = 8000;
const DETAIL_CONCURRENCY = 4;

export type PublicProject = {
  url: string;
  label: string; // "25-3Q Side | 1SelfWorld"
  quarter: string | null; // "25-3Q"
  isSide: boolean;
  imageUrl: string | null; // 기업 로고(구글 호스팅, 만료되지 않음)
  nameKo: string | null;
  nameEn: string | null;
  headline: string[];
  intro: string[];
  goals: string[];
};

export async function fetchPublicProjects(): Promise<PublicProject[]> {
  const list = parseGallery(await fetchText(`${SITE}${LIST_PATH}`));
  const out: PublicProject[] = [];
  for (let i = 0; i < list.length; i += DETAIL_CONCURRENCY) {
    const batch = list.slice(i, i + DETAIL_CONCURRENCY);
    const details = await Promise.all(
      batch.map((item) =>
        fetchText(item.url)
          .then(parseDetail)
          // 상세 하나가 깨져도 목록의 나머지는 살린다.
          .catch((err: unknown) => {
            console.error(`[public-projects] ${item.url} 읽기 실패`, err);
            return EMPTY_DETAIL;
          }),
      ),
    );
    batch.forEach((item, j) => out.push({ ...item, ...(details[j] ?? EMPTY_DETAIL) }));
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ghsnu-admin (+https://admin.ghsnu.com)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

type GalleryItem = Pick<PublicProject, "url" | "label" | "quarter" | "isSide" | "imageUrl">;
type Detail = Pick<PublicProject, "nameKo" | "nameEn" | "headline" | "intro" | "goals">;
const EMPTY_DETAIL: Detail = { nameKo: null, nameEn: null, headline: [], intro: [], goals: [] };

// 목록 페이지의 갤러리 항목: <a href="/PROJECT/view/123" data-title="26-3Q | 워프스페이스"> … <img src="…">
export function parseGallery(html: string): GalleryItem[] {
  const items: GalleryItem[] = [];
  const anchor = /<a href="(\/PROJECT\/view\/\d+)" data-title="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html))) {
    const [, path = "", rawLabel = ""] = m;
    const label = decodeEntities(rawLabel).trim();
    const rest = html.slice(m.index, m.index + 2000);
    const img = rest.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
    const quarter = label.match(/^(\d{2}-\dQ)/)?.[1] ?? null;
    items.push({
      url: `${SITE}${path}`,
      label,
      quarter,
      isSide: /^\d{2}-\dQ\s*Side\b/i.test(label),
      imageUrl: img ? decodeEntities(img) : null,
    });
  }
  return items;
}

const GOALS_HEADING = /^세부\s*목표\s*:?$/;
const INTRO_HEADING = /^프로젝트\s*소개$/;
const MAX_GOAL_LINES = 12;

export function parseDetail(html: string): Detail {
  const lines = htmlToLines(html);
  // 기업명 줄: "국문 | 영문". 메뉴의 경로 표시는 전각 "｜"라 걸리지 않고, "26-3Q | 기업"
  // 꼴(목록 라벨과 같은 글자)은 기업명 줄이 아니라 건너뛴다.
  const headerAt = lines.findIndex((l) => /^[^|｜]{1,40}\s\|\s.+$/.test(l) && !/^\d{2}-\dQ/.test(l));
  if (headerAt < 0) return EMPTY_DETAIL;
  const [nameKo = "", nameEn = ""] = (lines[headerAt] ?? "").split(/\s\|\s/).map((s) => s.trim());

  const introAt = lines.findIndex((l, i) => i > headerAt && INTRO_HEADING.test(l));
  const goalsAt = lines.findIndex((l, i) => i > headerAt && GOALS_HEADING.test(l));
  const headlineEnd = [introAt, goalsAt].filter((i) => i > 0).sort((a, b) => a - b)[0] ?? headerAt + 2;

  const headline = lines.slice(headerAt + 1, headlineEnd);
  const intro = introAt > 0 ? lines.slice(introAt + 1, goalsAt > introAt ? goalsAt : introAt + 4) : [];

  // 세부 목표는 번호·불릿으로 시작하는 줄만, 그렇지 않은 줄(다음 섹션 제목·본문)이 나오면 멈춘다.
  const goals: string[] = [];
  if (goalsAt > 0) {
    for (const line of lines.slice(goalsAt + 1)) {
      if (!/^(\d+(-\d+)*[.)]|\(\d+\)|[•·▪-])/.test(line)) break;
      goals.push(line);
      if (goals.length >= MAX_GOAL_LINES) break;
    }
  }
  return { nameKo: nameKo || null, nameEn: nameEn || null, headline, intro, goals };
}

// 블록 태그(div·p·br·li·h*)를 줄바꿈으로, 나머지 태그는 지우고, 빈 줄(공백·폭 없는 공백)은 버린다.
function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<head[\s>][\s\S]*?<\/head>/i, "") // <title>도 "26-3Q | 기업" 꼴이다
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/div|\/p|\/li|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((l) => l.replace(/[​ \s]+/g, " ").trim())
    .filter((l) => l.length > 0 && l !== ":");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

// --- Notion 프로젝트와 맞추기 ---

export type NotionProjectKey = { notionPageId: string; title: string; quarter: string | null };

// 같은 분기·같은 본/사이드 구분 안에서 기업명(국문 또는 영문)이 같은 것끼리 잇는다.
// 기업명이 다른 경우(홈페이지 "쿠키" = Notion "라이터스컴퍼니")는 그 분기·구분에
// 서로 하나씩만 남았을 때 잇는다.
export function matchPublicProjects(
  publics: PublicProject[],
  projects: NotionProjectKey[],
): Map<string, PublicProject> {
  const result = new Map<string, PublicProject>();
  const groupKey = (quarter: string | null, side: boolean) => `${quarter}|${side}`;
  const notionGroups = new Map<string, NotionProjectKey[]>();
  for (const p of projects) {
    const key = groupKey(p.quarter, /-S\)\s*$/.test(p.title));
    notionGroups.set(key, [...(notionGroups.get(key) ?? []), p]);
  }

  const leftovers = new Map<string, PublicProject[]>();
  for (const pub of publics) {
    if (!pub.quarter) continue;
    const key = groupKey(pub.quarter, pub.isSide);
    const names = [pub.nameKo, pub.nameEn, pub.label.split("|")[1]].filter(Boolean).map((n) => normalizeName(n!));
    const hit = (notionGroups.get(key) ?? []).find(
      (p) => !result.has(p.notionPageId) && names.includes(normalizeName(companyOf(p.title))),
    );
    if (hit) result.set(hit.notionPageId, pub);
    else leftovers.set(key, [...(leftovers.get(key) ?? []), pub]);
  }

  for (const [key, pubs] of leftovers) {
    const remaining = (notionGroups.get(key) ?? []).filter((p) => !result.has(p.notionPageId));
    const [onlyPub] = pubs;
    const [onlyNotion] = remaining;
    if (pubs.length === 1 && remaining.length === 1 && onlyPub && onlyNotion) {
      result.set(onlyNotion.notionPageId, onlyPub);
    }
  }
  return result;
}

function companyOf(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "");
}

// 대소문자·공백·하이픈 무시("S-OIL" = "s oil", "365MC" = "365mc").
function normalizeName(name: string): string {
  return name.replace(/[\s\-_.]+/g, "").toLowerCase();
}
