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
import { prisma } from "./prisma";
import { callNotionRateLimited, extractMultiSelect, extractPropertyText, getNotionClient } from "./notion";

// TTL은 컬럼이 아니라 코드 상수(DB_SCHEMA_HR.md §2).
const TTL_MS = 5 * 60 * 1000;

// 기수 20은 아직 프로필 사진·정보 수집이 안 끝나서 임시 제외한다(ARCHITECTURE.md
// §4, 2026-09-26 결정). 데이터 수집이 끝나면 이 상수 자체를 지운다 — "19 이하만"
// 처럼 커지는 문턱값이 아니라, 이 한 기수만 콕 집어 빼는 임시 필터다.
const EXCLUDED_COHORT = 20;

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
} as const;

export type PersonSummary = {
  notionPageId: string;
  name: string;
  cohort: number;
  department: string[];
  jobField: string | null;
  team: string[];
  position: string | null;
  currentCareerOneLine: string | null;
  linkedin: string | null;
  profileImageUrl: string | null;
};

export async function getPeopleList(): Promise<PersonSummary[]> {
  const row = await prisma.peopleCache.findUnique({ where: { key: "list" } });
  if (row && Date.now() - row.fetchedAt.getTime() < TTL_MS) {
    return row.data as unknown as PersonSummary[];
  }

  const list = await buildPeopleList();

  // upsert: 첫 실행이면 행이 없고, 그 이후엔 있다 — 매번 있는지 먼저 물어보지
  // 않고 한 번에 처리한다.
  await prisma.peopleCache.upsert({
    where: { key: "list" },
    create: { key: "list", data: list as unknown as object, fetchedAt: new Date() },
    update: { data: list as unknown as object, fetchedAt: new Date() },
  });

  return list;
}

async function buildPeopleList(): Promise<PersonSummary[]> {
  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) {
    throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
  }
  const notion = getNotionClient();

  const people: PersonSummary[] = [];
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
      if (!name || !Number.isFinite(cohort) || cohort === EXCLUDED_COHORT) continue;

      people.push({
        notionPageId: row.id,
        name,
        cohort,
        department: extractMultiSelect(props[PROPERTY.department]),
        jobField: extractPropertyText(props[PROPERTY.jobField]),
        team: extractMultiSelect(props[PROPERTY.team]),
        position: extractPropertyText(props[PROPERTY.position]),
        currentCareerOneLine: extractPropertyText(props[PROPERTY.currentCareer]),
        linkedin: extractPropertyText(props[PROPERTY.linkedin]),
        profileImageUrl: extractPropertyText(props[PROPERTY.profileImageUrl]),
      });
    }

    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return people;
}
