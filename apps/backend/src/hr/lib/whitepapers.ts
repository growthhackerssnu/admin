// Projects 앱(/projects) — Notion Projects DB의 각 행이 곧 한 프로젝트의 백서다
// (본문이 백서 템플릿: 프로젝트 개요 → 진행 프로세스 → 주요 성과 → 회고 …).
// 목록은 행 속성만, 상세는 본문 블록까지 읽어 화면이 그릴 수 있는 형태로 바꾼다.
//
// 공개 범위: admin·acting은 모든 백서 본문을 본다. alumni는 본인이 참여한(참여인원에
// 있는) 프로젝트만 본문을 보고, 나머지는 개요(분기·산업·기술·참여자·썸네일)만 본다.
// 개요만 보는 경우엔 본문을 아예 응답에 싣지 않는다(화면에서 가리는 게 아니라).
// 홈페이지(ghsnu.com/PROJECT)에 공개된 소개는 누구에게나 붙인다. 홈페이지를 읽지 않고
// 스크립트로 복사해 둔 것을 쓴다(publicProjects.ts).
//
// 캐시는 people과 같은 3단(서버 메모리 → hr.people_cache → Notion)이고, 같은
// people_cache 테이블을 "whitepapers"·"whitepaper:<id>" 키로 같이 쓴다(사람 키는
// "list"와 Notion 페이지 ID라 겹치지 않는다). 본문 이미지의 Notion 파일 URL은
// 약 1시간 뒤 만료되는데, 캐시 TTL이 5분이라 만료 전에 항상 새로 받아온다.
import { prisma } from "@/lib/prisma";
import { CACHE_TTL_MS, memoryGet, memorySet, singleFlight } from "./memoryCache";
import type { MemberWithOpsRoles } from "@/portal/lib/opsRoles";
import { callNotionRateLimited, extractMultiSelect, extractPropertyText, getNotionClient } from "./notion";
import { getPeopleList } from "./peopleCache";
import { matchProjectLines } from "./projectTextMatch";
import { getPublicProject, type PublicProjectRecord } from "./publicProjects";
import { getThumbnailUrls, scheduleThumbnailSync, type ThumbnailCandidate } from "./whitepaperThumbnails";

const PROPERTY = {
  title: "Name",
  quarter: "분기",
  oneLiner: "한줄설명",
  technology: "기술분류",
  industry: "산업 분류",
  pm: "PM",
  members: "참여인원",
  logo: "로고",
} as const;

// 새 백서를 만들 때 복제하는 원본 행. 실제 프로젝트가 아니라 목록에서 뺀다.
const TEMPLATE_TITLE = "백서 템플릿";

export type WhitepaperMember = { notionPageId: string; name: string; cohort: number; isPm: boolean };

export type WhitepaperSummary = {
  notionPageId: string;
  title: string;
  quarter: string | null;
  oneLiner: string | null;
  technology: string[];
  industry: string[];
  members: WhitepaperMember[];
};

export type RichTextSpan = {
  text: string;
  href: string | null;
  bold?: true;
  italic?: true;
  strikethrough?: true;
  underline?: true;
  code?: true;
};

// 화면이 그리는 블록. Notion 블록 타입 이름을 그대로 쓰고, 필요한 값만 남긴다.
export type WhitepaperBlock = {
  type: string;
  richText?: RichTextSpan[];
  children?: WhitepaperBlock[];
  checked?: boolean; // to_do
  icon?: string | null; // callout(이모지만)
  url?: string | null; // image·bookmark·file 등
  caption?: RichTextSpan[];
  title?: string; // child_page·child_database
  hasColumnHeader?: boolean; // table
  rows?: RichTextSpan[][][]; // table: 행 → 칸 → 글자
  columns?: WhitepaperBlock[][]; // column_list
};

export type WhitepaperDetail = WhitepaperSummary & {
  notionUrl: string;
  blocks: WhitepaperBlock[];
};

// 응답할 때 붙이는 값: 썸네일(홈페이지 로고 복사본 → Notion에서 옮긴 이미지 순), 홈페이지 제목,
// 그리고 보는 사람 기준의 참여 여부·본문 열람 가능 여부. 목록 캐시엔 없다.
export type WhitepaperListItem = WhitepaperSummary & {
  thumbnailUrl: string | null;
  publicTitle: string | null;
  isMine: boolean;
  canRead: boolean;
};

// 홈페이지 공개 소개(누구나 봄). 홈페이지에 없는 프로젝트(24-3Q 이전 등)는 null.
export type PublicInfo = Pick<PublicProjectRecord, "sourceUrl" | "nameKo" | "nameEn" | "headline" | "blocks">;

// canRead가 false면 notionUrl·blocks가 없다.
export type WhitepaperView = WhitepaperListItem & {
  publicInfo: PublicInfo | null;
} & Partial<Pick<WhitepaperDetail, "notionUrl" | "blocks">>;

export type Viewer = { fullAccess: boolean; notionPageId: string | null };

// 본인 Notion People 페이지는 가입 때 인증한 people_directory 항목으로 안다(GET /people/me와 같은 방법).
export async function getViewer(member: MemberWithOpsRoles): Promise<Viewer> {
  const row = await prisma.member.findUnique({
    where: { id: member.id },
    include: { claimedPersonEntry: true },
  });
  return {
    fullAccess: member.role !== "alumni",
    notionPageId: row?.claimedPersonEntry?.notionPageId ?? null,
  };
}

export async function listWhitepapersFor(viewer: Viewer): Promise<WhitepaperListItem[]> {
  const [list, thumbnails] = await Promise.all([getWhitepaperList(), getThumbnailUrls()]);
  return list.map((w) => toListItem(w, viewer, thumbnails));
}

export async function getWhitepaperFor(viewer: Viewer, notionPageId: string): Promise<WhitepaperView | null> {
  const [list, thumbnails] = await Promise.all([getWhitepaperList(), getThumbnailUrls()]);
  const summary = list.find((w) => sameNotionId(w.notionPageId, notionPageId));
  if (!summary) return null;
  const pub = getPublicProject(summary.notionPageId);
  const item: WhitepaperView = {
    ...toListItem(summary, viewer, thumbnails),
    publicInfo: pub
      ? { sourceUrl: pub.sourceUrl, nameKo: pub.nameKo, nameEn: pub.nameEn, headline: pub.headline, blocks: pub.blocks }
      : null,
  };
  // 본문을 못 보는 사람에겐 Notion 본문을 읽지도 않고 개요·공개 소개만 준다.
  if (!item.canRead) return item;
  const detail = await getWhitepaperDetail(summary.notionPageId);
  return detail ? { ...item, notionUrl: detail.notionUrl, blocks: detail.blocks } : item;
}

function toListItem(w: WhitepaperSummary, viewer: Viewer, thumbnails: Record<string, string>): WhitepaperListItem {
  const isMine = Boolean(viewer.notionPageId && w.members.some((m) => sameNotionId(m.notionPageId, viewer.notionPageId!)));
  const pub = getPublicProject(w.notionPageId);
  return {
    ...w,
    thumbnailUrl: pub?.thumbnailUrl ?? thumbnails[w.notionPageId] ?? null,
    publicTitle: pub?.headline.join(" ") || null,
    isMine,
    canRead: viewer.fullAccess || isMine,
  };
}

function projectsDatabaseId(): string {
  const id = process.env.NOTION_PROJECTS_DATABASE_ID;
  if (!id) throw new Error("NOTION_PROJECTS_DATABASE_ID가 설정되지 않았습니다.");
  return id;
}

// peopleCache.ts와 같은 순서로 캐시를 읽는다. build가 null이면(없는 백서) 캐시하지 않는다.
async function readThrough<T>(key: string, build: () => Promise<T | null>): Promise<T | null> {
  const inMemory = memoryGet<T>(key);
  if (inMemory) return inMemory;

  return singleFlight(key, async () => {
    const row = await prisma.peopleCache.findUnique({ where: { key } });
    if (row && Date.now() - row.fetchedAt.getTime() < CACHE_TTL_MS) {
      const data = row.data as unknown as T;
      memorySet(key, data, row.fetchedAt.getTime());
      return data;
    }

    const data = await build();
    if (data === null) return null;
    await prisma.peopleCache.upsert({
      where: { key },
      create: { key, data: data as unknown as object, fetchedAt: new Date() },
      update: { data: data as unknown as object, fetchedAt: new Date() },
    });
    memorySet(key, data);
    return data;
  });
}

export async function getWhitepaperList(): Promise<WhitepaperSummary[]> {
  return (await readThrough("whitepapers", buildWhitepaperList)) ?? [];
}

export async function getWhitepaperDetail(notionPageId: string): Promise<WhitepaperDetail | null> {
  return readThrough(`whitepaper:${notionPageId}`, () => buildWhitepaperDetail(notionPageId));
}

// 프로필 "Projects" 자유 텍스트의 줄마다 이어질 백서 ID(projectTextMatch.ts). 백서를
// 못 읽어도 프로필은 떠야 하므로 실패하면 링크 없이(전부 null) 넘어간다.
export async function getProjectTextLinks(personId: string, projectsText: string): Promise<(string | null)[]> {
  try {
    return matchProjectLines(projectsText, await getWhitepaperList(), personId);
  } catch (err) {
    console.error("[whitepapers] 프로필 Projects 링크를 만들지 못했습니다.", err);
    return projectsText.split("\n").map(() => null);
  }
}

async function buildWhitepaperList(): Promise<WhitepaperSummary[]> {
  const databaseId = projectsDatabaseId();
  const notion = getNotionClient();
  const people = await peopleById();

  const list: WhitepaperSummary[] = [];
  const thumbnailCandidates: ThumbnailCandidate[] = [];
  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 }),
    );
    for (const row of page.results) {
      if (!("properties" in row)) continue;
      const props = row.properties as Record<string, unknown>;
      const summary = toSummary(row.id, props, people);
      if (!summary) continue;
      list.push(summary);
      if ("last_edited_time" in row) {
        thumbnailCandidates.push({
          notionPageId: row.id,
          lastEditedTime: row.last_edited_time,
          logoUrl: extractRollupFileUrl(props[PROPERTY.logo]),
        });
      }
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // 응답을 기다리게 하지 않는다(whitepaperThumbnails.ts 머리말 참고).
  scheduleThumbnailSync(thumbnailCandidates);

  // 최신 분기가 위로. 분기가 같으면 제목순.
  return list.sort(
    (a, b) => quarterKey(b.quarter) - quarterKey(a.quarter) || a.title.localeCompare(b.title, "ko"),
  );
}

async function buildWhitepaperDetail(notionPageId: string): Promise<WhitepaperDetail | null> {
  const notion = getNotionClient();
  const page = await callNotionRateLimited(() => notion.pages.retrieve({ page_id: notionPageId })).catch(
    (err: unknown) => {
      if ((err as { code?: string })?.code === "object_not_found") return null;
      throw err;
    },
  );
  if (!page || !("properties" in page)) return null;

  // integration은 People·팀 지원비 등 다른 DB도 볼 수 있다 — Projects DB의
  // 페이지가 아니면 없는 것으로 친다(아무 페이지 ID로 본문을 읽어가지 못하게).
  const parent = page.parent as { type: string; database_id?: string };
  if (parent.type !== "database_id" || !sameNotionId(parent.database_id, projectsDatabaseId())) return null;

  const summary = toSummary(page.id, page.properties as Record<string, unknown>, await peopleById());
  if (!summary) return null;

  return { ...summary, notionUrl: page.url, blocks: await fetchBlocks(page.id, 0) };
}

async function peopleById(): Promise<Map<string, { name: string; cohort: number }>> {
  const people = await getPeopleList();
  return new Map(people.map((p) => [p.notionPageId, { name: p.name, cohort: p.cohort }]));
}

// 템플릿 행과 참여인원이 아직 없는 행(분기 초에 만들어만 둔 빈 백서)은 목록에서 뺀다.
function toSummary(
  notionPageId: string,
  props: Record<string, unknown>,
  people: Map<string, { name: string; cohort: number }>,
): WhitepaperSummary | null {
  const title = extractPropertyText(props[PROPERTY.title]);
  if (!title || title === TEMPLATE_TITLE) return null;

  const memberIds = relationIds(props[PROPERTY.members]);
  if (memberIds.length === 0) return null;
  const pmIds = new Set(relationIds(props[PROPERTY.pm]));

  const members = memberIds.flatMap((id) => {
    const person = people.get(id);
    return person ? [{ notionPageId: id, ...person, isPm: pmIds.has(id) }] : [];
  });
  // PM을 앞에, 그다음 기수·이름순.
  members.sort(
    (a, b) => Number(b.isPm) - Number(a.isPm) || a.cohort - b.cohort || a.name.localeCompare(b.name, "ko"),
  );

  return {
    notionPageId,
    title,
    quarter: extractPropertyText(props[PROPERTY.quarter]),
    oneLiner: extractPropertyText(props[PROPERTY.oneLiner]),
    technology: extractMultiSelect(props[PROPERTY.technology]),
    industry: extractRollupMultiSelect(props[PROPERTY.industry]),
    members,
  };
}

function relationIds(property: unknown): string[] {
  const p = property as { type?: string; relation?: Array<{ id: string }> } | undefined;
  return p?.type === "relation" ? (p.relation ?? []).map((r) => r.id) : [];
}

// "산업 분류"는 기업 DB의 multi_select를 끌어온 rollup이라 배열 안에 multi_select가 들어있다.
function extractRollupMultiSelect(property: unknown): string[] {
  const p = property as { type?: string; rollup?: { type?: string; array?: unknown[] } } | undefined;
  if (p?.type !== "rollup" || p.rollup?.type !== "array") return [];
  const names = (p.rollup.array ?? []).flatMap((item) => extractMultiSelect(item));
  return [...new Set(names)];
}

// "로고"는 기업 DB의 files 속성을 끌어온 rollup이다. 첫 파일의 URL(Notion 업로드면 만료됨).
function extractRollupFileUrl(property: unknown): string | null {
  const p = property as { type?: string; rollup?: { type?: string; array?: unknown[] } } | undefined;
  if (p?.type !== "rollup" || p.rollup?.type !== "array") return null;
  for (const item of p.rollup.array ?? []) {
    const files = (item as { files?: Array<{ file?: { url?: string }; external?: { url?: string } }> }).files ?? [];
    for (const f of files) {
      const url = f.file?.url ?? f.external?.url;
      if (url) return url;
    }
  }
  return null;
}

// "26-4Q" → 2604. 형식이 다르면 맨 뒤로.
export function quarterKey(quarter: string | null): number {
  const match = quarter?.match(/^(\d{2})-(\d)Q/);
  return match ? Number(match[1]) * 100 + Number(match[2]) : -1;
}

function sameNotionId(a: string | undefined, b: string): boolean {
  return a?.replace(/-/g, "") === b.replace(/-/g, "");
}

// --- 본문 블록 ---

// 표·열·토글처럼 자식이 있는 블록은 자식까지 따라 내려간다. 백서 템플릿은
// column_list → column → 내용 정도라 깊이 3이면 충분하지만 여유를 둔다.
const MAX_DEPTH = 5;

type NotionBlock = { id: string; type: string; has_children?: boolean } & Record<string, unknown>;

async function listChildren(blockId: string): Promise<NotionBlock[]> {
  const notion = getNotionClient();
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 }),
    );
    for (const block of page.results) {
      if ("type" in block) blocks.push(block as unknown as NotionBlock);
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks;
}

async function fetchBlocks(blockId: string, depth: number): Promise<WhitepaperBlock[]> {
  const out: WhitepaperBlock[] = [];
  for (const block of await listChildren(blockId)) {
    const converted = await convertBlock(block, depth);
    if (converted) out.push(...converted);
  }
  return out;
}

async function childrenOf(block: NotionBlock, depth: number): Promise<WhitepaperBlock[] | undefined> {
  if (!block.has_children || depth >= MAX_DEPTH) return undefined;
  const children = await fetchBlocks(block.id, depth + 1);
  return children.length ? children : undefined;
}

const TEXT_BLOCKS = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "quote",
  "toggle",
  "to_do",
  "callout",
  "code",
]);

const LINK_BLOCKS = new Set(["bookmark", "embed", "link_preview", "file", "pdf", "video"]);

// 배열을 돌려주는 이유: synced_block처럼 껍데기 없이 자식만 펼쳐 넣는 경우가 있다.
async function convertBlock(block: NotionBlock, depth: number): Promise<WhitepaperBlock[] | null> {
  const body = (block[block.type] ?? {}) as Record<string, unknown>;

  if (TEXT_BLOCKS.has(block.type)) {
    const richText = toSpans(body.rich_text);
    const children = await childrenOf(block, depth);
    // 템플릿에 많은 빈 문단은 간격만 벌려서 뺀다.
    if (block.type === "paragraph" && richText.length === 0 && !children) return null;
    const converted: WhitepaperBlock = { type: block.type, richText, children };
    if (block.type === "to_do") converted.checked = Boolean(body.checked);
    if (block.type === "callout") {
      const icon = body.icon as { type?: string; emoji?: string } | null;
      converted.icon = icon?.type === "emoji" ? (icon.emoji ?? null) : null;
    }
    return [converted];
  }

  switch (block.type) {
    case "divider":
      return [{ type: "divider" }];
    case "image":
      return [{ type: "image", url: fileUrl(body), caption: toSpans(body.caption) }];
    case "table": {
      const rows = depth < MAX_DEPTH ? await listChildren(block.id) : [];
      return [
        {
          type: "table",
          hasColumnHeader: Boolean(body.has_column_header),
          rows: rows
            .filter((r) => r.type === "table_row")
            .map((r) => ((r.table_row as { cells?: unknown[] }).cells ?? []).map(toSpans)),
        },
      ];
    }
    case "column_list": {
      const columns = depth < MAX_DEPTH ? await listChildren(block.id) : [];
      const converted = await Promise.all(
        columns.filter((c) => c.type === "column").map((c) => fetchBlocks(c.id, depth + 2)),
      );
      return [{ type: "column_list", columns: converted }];
    }
    case "synced_block":
      return (await childrenOf(block, depth)) ?? null;
    case "child_page":
    case "child_database":
      return [{ type: block.type, title: (body.title as string) || "" }];
    default:
      if (LINK_BLOCKS.has(block.type)) {
        return [{ type: block.type, url: fileUrl(body) ?? (body.url as string) ?? null, caption: toSpans(body.caption) }];
      }
      // 수식·목차 등 백서에 쓰이지 않는 블록은 그리지 않는다.
      return null;
  }
}

// image·file·pdf·video 블록은 Notion에 올린 파일(file.url, 만료됨)이거나 외부 링크(external.url)다.
function fileUrl(body: Record<string, unknown>): string | null {
  const file = body.file as { url?: string } | undefined;
  const external = body.external as { url?: string } | undefined;
  return file?.url ?? external?.url ?? null;
}

function toSpans(richText: unknown): RichTextSpan[] {
  const arr = (richText ?? []) as Array<{
    plain_text?: string;
    href?: string | null;
    annotations?: Record<string, unknown>;
  }>;
  return arr
    .filter((t) => t.plain_text)
    .map((t) => {
      const span: RichTextSpan = { text: t.plain_text ?? "", href: t.href ?? null };
      for (const key of ["bold", "italic", "strikethrough", "underline", "code"] as const) {
        if (t.annotations?.[key]) span[key] = true;
      }
      return span;
    });
}
