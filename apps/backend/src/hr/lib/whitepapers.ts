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
// people_cache 테이블을 "whitepapers"·"whitepaper-body:<id>" 키로 같이 쓴다(사람 키는
// "list"와 Notion 페이지 ID라 겹치지 않는다).
//   - 목록: 5분 TTL. Notion 호출 한 번이고, 행마다 페이지 수정 시각(last_edited_time)이 온다.
//   - 상세(본문): Notion 블록을 재귀로 읽어야 해서 페이지당 수십 번 호출(~10초)이 든다.
//     그래서 목록의 수정 시각이 그대로인 동안은 계속 쓰고(수정되면 다시 만듦), 오래되면
//     (MAX_DETAIL_AGE_MS) 일단 보여주고 뒤에서 다시 만든다. 본문 이미지는 만들 때 비공개
//     버킷으로 옮겨 Notion URL 만료와 상관없게 한다(whitepaperImages.ts). 목록을 다시
//     만들 때 아직 안 만든 상세 몇 개를 뒤에서 미리 만들어 둔다(prewarm).
import { prisma } from "@/lib/prisma";
import { CACHE_TTL_MS, memoryGet, memorySet, singleFlight } from "./memoryCache";
import type { MemberWithOpsRoles } from "@/portal/lib/opsRoles";
import { callNotionRateLimited, extractMultiSelect, extractPropertyText, getNotionClient } from "./notion";
import { getPeopleList } from "./peopleCache";
import { companyName, matchProjectLines } from "./projectTextMatch";
import { getPublicProject, type PublicProjectRecord } from "./publicProjects";
import { companyLogoUrl } from "./companyLogos";
import { getThumbnailUrls, scheduleThumbnailSync, type ThumbnailCandidate } from "./whitepaperThumbnails";
import { copyWhitepaperImages, NOTION_URL_SAFE_MS, signWhitepaperImages } from "./whitepaperImages";

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
  // Notion 페이지 수정 시각 — 상세 캐시가 아직 맞는지 판단하는 데 쓴다.
  lastEditedTime: string | null;
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
  storagePath?: string; // image: 비공개 버킷 경로(응답 때 서명 URL로 바뀜)
  imageKey?: string; // image: 블록 id + 수정 시각(복사 경로용, 응답엔 안 나감)
};

export type WhitepaperDetail = WhitepaperSummary & {
  notionUrl: string;
  blocks: WhitepaperBlock[];
};

// 응답할 때 붙이는 값: 썸네일(홈페이지 로고 복사본 → Notion에서 옮긴 이미지 → 같은 기업의 다른
// 프로젝트 썸네일 → 따로 올려둔 기업 로고 순, resolveThumbnails), 홈페이지 제목,
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
  const resolved = resolveThumbnails(list, thumbnails);
  return list.map((w) => toListItem(w, viewer, resolved));
}

export async function getWhitepaperFor(viewer: Viewer, notionPageId: string): Promise<WhitepaperView | null> {
  const [list, thumbnails] = await Promise.all([getWhitepaperList(), getThumbnailUrls()]);
  const summary = list.find((w) => sameNotionId(w.notionPageId, notionPageId));
  if (!summary) return null;
  const pub = getPublicProject(summary.notionPageId);
  const item: WhitepaperView = {
    ...toListItem(summary, viewer, resolveThumbnails(list, thumbnails)),
    publicInfo: pub
      ? { sourceUrl: pub.sourceUrl, nameKo: pub.nameKo, nameEn: pub.nameEn, headline: pub.headline, blocks: pub.blocks }
      : null,
  };
  // 본문을 못 보는 사람에겐 Notion 본문을 읽지도 않고 개요·공개 소개만 준다.
  if (!item.canRead) return item;
  const detail = await getWhitepaperDetail(summary);
  if (!detail) return item;
  return { ...item, notionUrl: detail.notionUrl, blocks: await signWhitepaperImages(detail.blocks) };
}

function toListItem(w: WhitepaperSummary, viewer: Viewer, thumbnails: Map<string, string>): WhitepaperListItem {
  const isMine = Boolean(viewer.notionPageId && w.members.some((m) => sameNotionId(m.notionPageId, viewer.notionPageId!)));
  const pub = getPublicProject(w.notionPageId);
  return {
    ...w,
    thumbnailUrl: thumbnails.get(w.notionPageId) ?? null,
    publicTitle: pub?.headline.join(" ") || null,
    isMine,
    canRead: viewer.fullAccess || isMine,
  };
}

// 프로젝트 ID → 썸네일 URL. 자기 이미지(홈페이지 로고 복사본 → Notion에서 옮긴 이미지)가 없으면
// 같은 기업의 다른 프로젝트(재수주) 썸네일을 최신 분기 것부터 빌려 쓰고, 그것도 없으면 따로
// 올려둔 기업 로고(companyLogos.ts)를 쓴다.
function resolveThumbnails(list: WhitepaperSummary[], thumbnails: Record<string, string>): Map<string, string> {
  const own = new Map<string, string>();
  const byCompany = new Map<string, string>();
  for (const w of list) {
    const url = getPublicProject(w.notionPageId)?.thumbnailUrl ?? thumbnails[w.notionPageId];
    if (!url) continue;
    own.set(w.notionPageId, url);
    const company = companyName(w.title);
    if (!byCompany.has(company)) byCompany.set(company, url); // 목록이 최신 분기순이라 먼저 나온 게 최신
  }
  const resolved = new Map<string, string>();
  for (const w of list) {
    const company = companyName(w.title);
    const url = own.get(w.notionPageId) ?? byCompany.get(company) ?? companyLogoUrl(company);
    if (url) resolved.set(w.notionPageId, url);
  }
  return resolved;
}

function projectsDatabaseId(): string {
  const id = process.env.NOTION_PROJECTS_DATABASE_ID;
  if (!id) throw new Error("NOTION_PROJECTS_DATABASE_ID가 설정되지 않았습니다.");
  return id;
}

// peopleCache.ts와 같은 순서로 캐시를 읽는다. DB에 낡은 값이라도 있으면 일단 그걸 돌려주고
// 뒤에서 새로 만든다(만료 직후 첫 사람이 Notion을 기다리지 않게). 아예 없을 때만 기다린다.
async function readThrough<T>(key: string, build: () => Promise<T | null>): Promise<T | null> {
  const inMemory = memoryGet<T>(key);
  if (inMemory) return inMemory;

  const refresh = () =>
    singleFlight(`${key}:build`, async () => {
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

  const row = await singleFlight(key, () => prisma.peopleCache.findUnique({ where: { key } }));
  if (!row) return refresh();
  const data = row.data as unknown as T;
  if (Date.now() - row.fetchedAt.getTime() >= CACHE_TTL_MS) {
    void refresh().catch((err) => console.error(`[whitepapers] ${key} 재생성 실패`, err));
  } else {
    memorySet(key, data, row.fetchedAt.getTime());
  }
  return data;
}

export async function getWhitepaperList(): Promise<WhitepaperSummary[]> {
  return (await readThrough("whitepapers", buildWhitepaperList)) ?? [];
}

// --- 상세 캐시 ---

// 수정이 없어도 이 시간이 지나면 뒤에서 다시 만든다(참여인원 이름 변경 등 반영용).
const MAX_DETAIL_AGE_MS = 24 * 60 * 60 * 1000;
const PREWARM_PER_RUN = 2;

type DetailRecord = {
  version: 2;
  lastEditedTime: string | null; // 만들 때의 Notion 페이지 수정 시각
  builtAt: number;
  expiresAt: number | null; // Notion 서명 URL이 남아 있으면 그 만료 전 시각
  detail: WhitepaperDetail;
};

// 5분 캐시 시절의 "whitepaper:<id>"와 형식이 달라 키를 따로 쓴다(배포 중 옛 코드와 섞이지 않게).
const detailKey = (notionPageId: string) => `whitepaper-body:${notionPageId}`;

async function loadDetailRecord(notionPageId: string): Promise<DetailRecord | null> {
  const key = detailKey(notionPageId);
  const inMemory = memoryGet<DetailRecord>(key, Number.POSITIVE_INFINITY);
  if (inMemory) return inMemory;
  const row = await prisma.peopleCache.findUnique({ where: { key } });
  const record = row?.data as unknown as DetailRecord | undefined;
  if (!record || record.version !== 2) return null;
  memorySet(key, record);
  return record;
}

function isUpToDate(record: DetailRecord, summary: WhitepaperSummary): boolean {
  if (record.expiresAt !== null && Date.now() >= record.expiresAt) return false;
  // 수정 시각을 모르면(이 필드가 생기기 전 목록 캐시면 undefined) 나이로만 판단한다.
  return summary.lastEditedTime == null || record.lastEditedTime === summary.lastEditedTime;
}

export async function getWhitepaperDetail(summary: WhitepaperSummary): Promise<WhitepaperDetail | null> {
  const record = await loadDetailRecord(summary.notionPageId);
  if (record && isUpToDate(record, summary)) {
    // 오래됐으면 일단 지금 것을 보여주고 뒤에서 다시 만든다.
    if (Date.now() - record.builtAt > MAX_DETAIL_AGE_MS) {
      void rebuildDetail(summary.notionPageId).catch((err) => console.error("[whitepapers] 상세 재생성 실패", err));
    }
    return record.detail;
  }
  return (await rebuildDetail(summary.notionPageId))?.detail ?? null;
}

function rebuildDetail(notionPageId: string): Promise<DetailRecord | null> {
  return singleFlight(detailKey(notionPageId), async () => {
    const detail = await buildWhitepaperDetail(notionPageId);
    if (!detail) return null;
    const hasExpiringUrls = await copyWhitepaperImages(detail.notionPageId, detail.blocks);
    const builtAt = Date.now();
    const record: DetailRecord = {
      version: 2,
      lastEditedTime: detail.lastEditedTime,
      builtAt,
      expiresAt: hasExpiringUrls ? builtAt + NOTION_URL_SAFE_MS : null,
      detail,
    };
    const key = detailKey(notionPageId);
    await prisma.peopleCache.upsert({
      where: { key },
      create: { key, data: record as unknown as object, fetchedAt: new Date(builtAt) },
      update: { data: record as unknown as object, fetchedAt: new Date(builtAt) },
    });
    memorySet(key, record);
    return record;
  });
}

// 상세를 한꺼번에 미리 만든다(scripts/hr/warmWhitepapers.ts). 이미 최신인 것은 건너뛴다.
export async function warmAllWhitepaperDetails(onEach?: (title: string, built: boolean) => void): Promise<number> {
  let built = 0;
  for (const summary of await getWhitepaperList()) {
    const record = await loadDetailRecord(summary.notionPageId);
    const fresh = Boolean(record && isUpToDate(record, summary));
    if (!fresh) {
      await rebuildDetail(summary.notionPageId);
      built++;
    }
    onEach?.(summary.title, !fresh);
  }
  return built;
}

let prewarming = false;

// 목록을 다시 만든 뒤, 상세가 없거나 낡은 백서 몇 개를 최근 분기부터 뒤에서 미리 만든다.
// Notion 호출 슬롯을 사용자 요청과 같이 쓰므로 한 번에 조금씩만 한다.
function schedulePrewarm(list: WhitepaperSummary[]): void {
  if (prewarming) return;
  prewarming = true;
  void (async () => {
    let built = 0;
    for (const summary of list) {
      if (built >= PREWARM_PER_RUN) break;
      const record = await loadDetailRecord(summary.notionPageId);
      if (record && isUpToDate(record, summary)) continue;
      await rebuildDetail(summary.notionPageId);
      built++;
    }
  })()
    .catch((err) => console.error("[whitepapers] 상세 미리 만들기 실패", err))
    .finally(() => {
      prewarming = false;
    });
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
      const summary = toSummary(row.id, props, people, "last_edited_time" in row ? row.last_edited_time : null);
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
  list.sort((a, b) => quarterKey(b.quarter) - quarterKey(a.quarter) || a.title.localeCompare(b.title, "ko"));
  schedulePrewarm(list);
  return list;
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

  const summary = toSummary(
    page.id,
    page.properties as Record<string, unknown>,
    await peopleById(),
    "last_edited_time" in page ? page.last_edited_time : null,
  );
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
  lastEditedTime: string | null,
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
    lastEditedTime,
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

type NotionBlock = { id: string; type: string; has_children?: boolean; last_edited_time?: string } & Record<
  string,
  unknown
>;

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
      return [
        {
          type: "image",
          url: fileUrl(body),
          caption: toSpans(body.caption),
          // 이미지가 바뀌면(같은 블록에 새 파일) 수정 시각이 바뀌어 새 경로로 복사된다.
          imageKey: `${block.id}-${(block.last_edited_time ?? "").replace(/\D/g, "")}`,
        },
      ];
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
