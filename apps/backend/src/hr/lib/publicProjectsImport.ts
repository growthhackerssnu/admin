// 홈페이지(ghsnu.com/PROJECT) 프로젝트 소개를 복사해 올 때 쓰는 조각들 — 일회성 스크립트
// (scripts/hr/importPublicProjects.ts) 전용이다. 서버는 이 파일을 쓰지 않고 저장된
// 복사본만 읽는다(publicProjects.ts).
//
// 홈페이지는 사이트 빌더로 만든 HTML이라 API가 없다. 목록 페이지의 갤러리 항목과
// 프로젝트별 상세 페이지를 읽는다. 상세 페이지는 줄마다 <div> 하나라서 줄 단위로 읽는다:
//   "워프스페이스 | WARPSPACE"   ← 기업명(국문 | 영문)
//   "캐릭터 개인화 추천 알고리즘 설계" ← 프로젝트 제목(여러 줄일 수 있음)
//   "프로젝트 소개"·"로드맵"·"진행 프로세스"·"성과 및 인사이트"·"PM 소회" ← 구역 제목(굵고 큰 글씨)
//   그 아래 문단·목록(<li>)·인용(<blockquote>, PM 소회의 질문)·이미지
import type { PublicBlock } from "./publicProjects";

export const SITE = "https://ghsnu.com";
export const LIST_URL = `${SITE}/PROJECT`;

export type GalleryItem = {
  url: string;
  label: string; // "25-3Q Side | 1SelfWorld"
  quarter: string | null; // "25-3Q"
  isSide: boolean;
  imageUrl: string | null; // 기업 로고(홈페이지 원본)
};

export type ParsedDetail = {
  nameKo: string | null;
  nameEn: string | null;
  headline: string[];
  blocks: PublicBlock[];
};

export type PublicProject = GalleryItem & ParsedDetail;

const EMPTY_DETAIL: ParsedDetail = { nameKo: null, nameEn: null, headline: [], blocks: [] };

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
    items.push({
      url: `${SITE}${path}`,
      label,
      quarter: label.match(/^(\d{2}-\dQ)/)?.[1] ?? null,
      isSide: /^\d{2}-\dQ\s*Side\b/i.test(label),
      imageUrl: img ? decodeEntities(img) : null,
    });
  }
  return items;
}

type Chunk = { text: string; html: string; inList: boolean; inQuote: boolean; images: string[] };

// 줄 경계 태그: 여기서 한 줄이 끝난다. <li>·<blockquote>는 줄을 끊으면서 목록·인용 깊이도 바꾼다.
const LINE_BREAK = /^<(br|\/?div|\/?p|\/?h[1-6]|\/?li|\/?blockquote|\/?ol|\/?ul)\b/i;

// 태그와 글자를 앞에서부터 차례로 읽어 줄로 나눈다. 줄마다 그 줄의 첫 글자가 나온 시점에
// 목록(<li>)·인용(<blockquote>) 안이었는지 기록하고, 굵기·크기 판단용으로 줄의 HTML도 남긴다.
// 이미지는 나온 자리에서 따로 한 줄이 된다(글과의 순서 유지).
function toChunks(html: string): Chunk[] {
  const body = html
    .replace(/<head[\s>][\s\S]*?<\/head>/i, "") // <title>도 "26-3Q | 기업" 꼴이다
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const chunks: Chunk[] = [];
  let listDepth = 0;
  let quoteDepth = 0;
  let line = { text: "", html: "", inList: false, inQuote: false };

  const flush = () => {
    const text = cleanText(line.text);
    if (text) chunks.push({ text, html: line.html, inList: line.inList, inQuote: line.inQuote, images: [] });
    line = { text: "", html: "", inList: false, inQuote: false };
  };

  for (const [token] of body.matchAll(/<[^>]+>|[^<]+/g)) {
    if (!token.startsWith("<")) {
      if (!cleanText(line.text) && cleanText(token)) {
        line.inList = listDepth > 0;
        line.inQuote = quoteDepth > 0;
      }
      line.text += token;
      continue;
    }
    const img = token.match(/^<img\b[^>]*\bsrc="([^"]+)"/i);
    if (img) {
      flush();
      chunks.push({ text: "", html: token, inList: false, inQuote: false, images: [decodeEntities(img[1] ?? "")] });
      continue;
    }
    if (LINE_BREAK.test(token)) {
      flush();
      if (/^<li\b/i.test(token)) listDepth++;
      else if (/^<\/li>/i.test(token)) listDepth = Math.max(0, listDepth - 1);
      else if (/^<blockquote\b/i.test(token)) quoteDepth++;
      else if (/^<\/blockquote>/i.test(token)) quoteDepth = Math.max(0, quoteDepth - 1);
      continue;
    }
    line.html += token;
  }
  flush();
  return chunks;
}

const HEADER_LINE = /^[^|｜]{1,40}\s\|\s.+$/;
const BOLD = /font-weight:\s*(700|bold)|<(b|strong|u)\b/i;
const SECTION_SIZE = /fsize(2[0-9]|3[0-9])\b/;

export function parseDetail(html: string): ParsedDetail {
  const chunks = toChunks(html);
  // 기업명 줄: "국문 | 영문". 메뉴의 경로 표시는 전각 "｜"라 걸리지 않고, "26-3Q | 기업"
  // 꼴(목록 라벨과 같은 글자)은 기업명 줄이 아니라 건너뛴다.
  const headerAt = chunks.findIndex((c) => HEADER_LINE.test(c.text) && !/^\d{2}-\dQ/.test(c.text));
  const header = chunks[headerAt];
  if (!header) return EMPTY_DETAIL;
  const [nameKo = "", nameEn = ""] = header.text.split(/\s\|\s/).map((s) => s.trim());

  const isSection = (c: Chunk) => Boolean(c.text) && SECTION_SIZE.test(c.html) && BOLD.test(c.html) && c.text.length <= 40;
  const rest = chunks.slice(headerAt + 1);
  const firstSection = rest.findIndex(isSection);
  const headlineChunks = firstSection >= 0 ? rest.slice(0, firstSection) : rest.slice(0, 1);

  const blocks: PublicBlock[] = [];
  for (const c of firstSection >= 0 ? rest.slice(firstSection) : []) {
    if (isSection(c)) {
      blocks.push({ type: "heading", text: c.text });
    } else if (c.text) {
      const block: PublicBlock = { type: "text", text: c.text };
      // 짧은 줄 전체가 굵거나 밑줄이면(세부 목표의 큰 항목, 소제목) 굵게 둔다.
      if (BOLD.test(c.html) && c.text.length <= 80 && !c.inQuote) block.bold = true;
      if (c.inList) block.list = true;
      if (c.inQuote) block.quote = true;
      blocks.push(block);
    }
    for (const url of c.images) blocks.push({ type: "image", url });
  }

  return {
    nameKo: nameKo || null,
    nameEn: nameEn || null,
    headline: headlineChunks.map((c) => c.text).filter(Boolean),
    blocks,
  };
}

function cleanText(text: string): string {
  return decodeEntities(text)
    .replace(/[​ \s]+/g, " ")
    .trim()
    .replace(/^:$/, "");
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
