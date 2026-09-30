// hr.people_cache의 "list" 키(디렉토리 목록 경량 요약)를 읽고, TTL이 지났으면
// Notion에서 다시 채운다. DB_SCHEMA_HR.md §2, §2.1, ARCHITECTURE.md §4/§12.2 참고.
//
// 프로필 사진은 더 이상 본문 블록을 따로 조회하지 않는다 — 2026-09-28
// 일회성 마이그레이션(prisma/migrateProfileImages.ts)으로 Supabase Storage에
// 옮기고 그 영구 URL을 Notion "Profile Image URL" 속성에 저장해뒀기 때문에,
// 다른 속성들과 완전히 동일하게 한 번의 query-data-source로 같이 온다.
// 예전엔 사람마다 get-block-children을 따로 불러야 해서(N+1) 캐시 만료 직후
// 첫 요청자가 약 100초를 기다렸는데(실측, worklog §39), 이 변경으로 그 문제
// 자체가 사라졌다(worklog §40~41).
import { prisma } from "@/lib/prisma";
import { CACHE_TTL_MS, memoryGet, memorySet, singleFlight } from "./memoryCache";
import {
  callNotionRateLimited,
  extractMultiSelect,
  extractPropertyText,
  getNotionClient,
  richTextToPlain,
} from "./notion";
import { scheduleProfileImageSync, type ImageCandidate } from "./profileImageSync";

// TTL은 컬럼이 아니라 코드 상수(DB_SCHEMA_HR.md §2). 읽기 순서는
// ①서버 메모리 → ②hr.people_cache(DB) → ③Notion 재조회(memoryCache.ts 참고).
const TTL_MS = CACHE_TTL_MS;

// 기수 20 임시 제외 필터는 2026-09-30에 제거했다 — 사진이 없는 신입도
// profileImageUrl=null로 목록에 들어가고, 프론트가 기본 프로필을 그린다
// (profileImageSync.ts).

const PROPERTY = {
  cohort: "기수",
  name: "Name",
  department: "학과",
  jobField: "직무 계열",
  team: "소속팀",
  position: "직책",
  currentCareer: "현재 커리어",
  linkedin: "LinkedIn",
  profileImageUrl: "Profile Image URL",
  email: "이메일",
} as const;

// 본문에서 이 3개 heading_1 아래에 있는 내용만 프로필 상세에 쓴다(§12.3).
// heading 자체보다 위(프로필 사진 블록)나, 이 셋 다 아닌 heading 아래 내용은
// 무시한다.
const SECTION_HEADINGS = ["Careers", "Activities", "Projects"] as const;
type SectionName = (typeof SECTION_HEADINGS)[number];

export type PersonSummary = {
  notionPageId: string;
  name: string;
  cohort: number;
  department: string[];
  // 2026-09-30: Notion "직무 계열"이 select → multi_select로 바뀌어 배열이다.
  jobField: string[];
  team: string[];
  position: string | null;
  currentCareerOneLine: string | null;
  linkedin: string | null;
  profileImageUrl: string | null;
};

// 직무 계열이 단일 값이던 시절(문자열/null)에 만들어진 캐시 행이 배포 직후
// 최대 5분 남아 있을 수 있다 — 읽을 때 배열로 맞춘다.
function normalizeJobField(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" && value ? [value] : [];
}

function normalizeSummary<T extends { jobField: unknown }>(person: T): T & { jobField: string[] } {
  return { ...person, jobField: normalizeJobField(person.jobField) };
}

export async function getPeopleList(): Promise<PersonSummary[]> {
  const inMemory = memoryGet<PersonSummary[]>("list");
  if (inMemory) return inMemory;

  return singleFlight("list", async () => {
    const row = await prisma.peopleCache.findUnique({ where: { key: "list" } });
    if (row && Date.now() - row.fetchedAt.getTime() < TTL_MS) {
      const list = (row.data as unknown as PersonSummary[]).map(normalizeSummary);
      memorySet("list", list, row.fetchedAt.getTime());
      return list;
    }

    const { list, imageCandidates } = await buildPeopleList();

    // upsert: 첫 실행이면 행이 없고, 그 이후엔 있다 — 매번 있는지 먼저 물어보지
    // 않고 한 번에 처리한다.
    await prisma.peopleCache.upsert({
      where: { key: "list" },
      create: { key: "list", data: list as unknown as object, fetchedAt: new Date() },
      update: { data: list as unknown as object, fetchedAt: new Date() },
    });
    memorySet("list", list);

    // 사진 없는 사람은 본문에 새로 올린 사진이 있는지 확인해서 자동 이관한다.
    // 응답을 기다리게 하지 않는다(profileImageSync.ts 머리말 참고).
    scheduleProfileImageSync(imageCandidates);

    return list;
  });
}

async function buildPeopleList(): Promise<{ list: PersonSummary[]; imageCandidates: ImageCandidate[] }> {
  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) {
    throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
  }
  const notion = getNotionClient();

  const people: PersonSummary[] = [];
  const imageCandidates: ImageCandidate[] = [];
  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 }),
    );

    for (const row of page.results) {
      if (!("properties" in row)) continue;
      const props = row.properties as Record<string, unknown>;

      const cohortText = extractPropertyText(props[PROPERTY.cohort]);
      const name = extractPropertyText(props[PROPERTY.name]);
      const cohort = cohortText ? Number(cohortText) : NaN;
      // 이름·기수가 없으면 아직 정보가 안 채워진 자리표시자 행일 가능성이 커서
      // 건너뛴다 — 검색/필터 대상에 빈 카드가 섞이는 걸 방지.
      if (!name || !Number.isFinite(cohort)) continue;

      const profileImageUrl = extractPropertyText(props[PROPERTY.profileImageUrl]);
      // 전원이 후보다 — 실제로 Notion 블록을 확인할지는 profileImageSync가 확인 기록을
      // 보고 정한다(사진이 없는 신규 등록 + 이미 있는 사람의 교체 감지).
      if ("last_edited_time" in row) {
        imageCandidates.push({
          notionPageId: row.id,
          name,
          lastEditedTime: row.last_edited_time,
          hasImageUrl: Boolean(profileImageUrl),
        });
      }

      people.push({
        notionPageId: row.id,
        name,
        cohort,
        department: extractMultiSelect(props[PROPERTY.department]),
        jobField: extractMultiSelect(props[PROPERTY.jobField]),
        team: extractMultiSelect(props[PROPERTY.team]),
        position: extractPropertyText(props[PROPERTY.position]),
        currentCareerOneLine: extractPropertyText(props[PROPERTY.currentCareer]),
        linkedin: extractPropertyText(props[PROPERTY.linkedin]),
        profileImageUrl,
      });
    }

    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return { list: people, imageCandidates };
}

export type PersonDetail = PersonSummary & {
  email: string | null;
  // Careers/Activities/Projects 섹션. Notion block content를 그대로 저장하지
  // 않고 일반 텍스트로 변환해서 저장한다 — 수정 폼이 이 섹션을 "일반 텍스트
  // 입력창"으로 편집하게 설계했으므로(§12.3, 2026-09-28 결정), 조회 화면도
  // 같은 표현을 그대로 보여주면 된다(별도 블록 렌더러가 필요 없음).
  careersText: string;
  activitiesText: string;
  projectsText: string;
};

export async function getPersonDetail(notionPageId: string): Promise<PersonDetail | null> {
  const inMemory = memoryGet<PersonDetail>(notionPageId);
  if (inMemory) return inMemory;

  return singleFlight(notionPageId, async () => {
    const row = await prisma.peopleCache.findUnique({ where: { key: notionPageId } });
    if (row && Date.now() - row.fetchedAt.getTime() < TTL_MS) {
      const detail = normalizeSummary(row.data as unknown as PersonDetail);
      memorySet(notionPageId, detail, row.fetchedAt.getTime());
      return detail;
    }

    const detail = await buildPersonDetail(notionPageId);
    if (!detail) return null;

    await prisma.peopleCache.upsert({
      where: { key: notionPageId },
      create: { key: notionPageId, data: detail as unknown as object, fetchedAt: new Date() },
      update: { data: detail as unknown as object, fetchedAt: new Date() },
    });
    memorySet(notionPageId, detail);

    return detail;
  });
}

async function buildPersonDetail(notionPageId: string): Promise<PersonDetail | null> {
  const notion = getNotionClient();

  const page = await callNotionRateLimited(() => notion.pages.retrieve({ page_id: notionPageId })).catch(
    (err: unknown) => {
      // 없는 페이지 ID로 들어오면 Notion이 404를 준다 — 그대로 null 처리.
      if ((err as { code?: string })?.code === "object_not_found") return null;
      throw err;
    },
  );
  if (!page || !("properties" in page)) return null;
  const props = page.properties as Record<string, unknown>;

  const cohortText = extractPropertyText(props[PROPERTY.cohort]);
  const name = extractPropertyText(props[PROPERTY.name]);
  const cohort = cohortText ? Number(cohortText) : NaN;
  if (!name || !Number.isFinite(cohort)) return null;

  const sections = await fetchSections(notionPageId);

  return {
    notionPageId,
    name,
    cohort,
    department: extractMultiSelect(props[PROPERTY.department]),
    jobField: extractMultiSelect(props[PROPERTY.jobField]),
    team: extractMultiSelect(props[PROPERTY.team]),
    position: extractPropertyText(props[PROPERTY.position]),
    currentCareerOneLine: extractPropertyText(props[PROPERTY.currentCareer]),
    linkedin: extractPropertyText(props[PROPERTY.linkedin]),
    profileImageUrl: extractPropertyText(props[PROPERTY.profileImageUrl]),
    email: extractPropertyText(props[PROPERTY.email]),
    careersText: sections.Careers,
    activitiesText: sections.Activities,
    projectsText: sections.Projects,
  };
}

// 본문 블록을 페이지네이션하며 순회해서, "Careers"/"Activities"/"Projects"
// heading_1 아래에 있는 문단·목록 블록만 일반 텍스트로 모은다. 프로필 사진
// 블록(맨 앞)처럼 인식 못 하는 heading 아래 내용은 버린다.
async function fetchSections(pageId: string): Promise<Record<SectionName, string>> {
  const notion = getNotionClient();
  const lines: Record<SectionName, string[]> = { Careers: [], Activities: [], Projects: [] };
  let current: SectionName | null = null;

  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 }),
    );

    for (const block of page.results) {
      if (!("type" in block)) continue;
      const b = block as { type: string } & Record<string, unknown>;

      if (b.type === "heading_1") {
        const heading = richTextToPlain((b.heading_1 as { rich_text?: unknown })?.rich_text);
        current = (SECTION_HEADINGS as readonly string[]).includes(heading) ? (heading as SectionName) : null;
        continue;
      }
      if (!current) continue;

      const line = blockToLine(b);
      if (line !== null) lines[current].push(line);
    }

    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return {
    Careers: lines.Careers.join("\n"),
    Activities: lines.Activities.join("\n"),
    Projects: lines.Projects.join("\n"),
  };
}

// bulleted_list_item은 "- "(마크다운 대시) 접두사로 표현한다 — Notion 자체가
// "-"+스페이스를 불릿으로 자동변환하는 마크다운 단축키를 쓰고, 나중에 승인
// write-back에서 텍스트를 다시 블록으로 되돌릴 때도 "줄이 '-'로 시작하면
// bulleted_list_item, 아니면 paragraph"라는 규칙을 그대로 재사용할 수 있다
// (2026-09-28 결정, 이전엔 "•" 기호를 썼는데 타이핑하기 불편해서 정정).
function blockToLine(block: { type: string } & Record<string, unknown>): string | null {
  if (block.type === "bulleted_list_item") {
    return `- ${richTextToPlain((block.bulleted_list_item as { rich_text?: unknown })?.rich_text)}`;
  }
  if (block.type === "paragraph") {
    return richTextToPlain((block.paragraph as { rich_text?: unknown })?.rich_text);
  }
  // 다른 블록 타입(표, 콜아웃 등)은 지금 데이터엔 없는 것으로 확인됐고
  // (§12.2 설계 당시 전수 조사), 나오면 일단 무시한다 — 과설계 방지.
  return null;
}
