// 노션 People DB(액팅 기수 + 알럼나이 전체) -> people_directory 동기화.
// 재실행해도 안전하다(notionPageId 기준 upsert).
//
// 두 곳에서 부른다:
//   - app/api/auth/signup-requests — 가입 신청이 명단에 없을 때. 새 기수는 1년에
//     두 번뿐이라 주기 실행 대신 필요할 때만 노션을 확인한다.
//   - scripts/portal/importPeopleDirectory.ts — 수동 실행.
//
// 이 테이블은 "가입 신청한 사람이 진짜 명단에 있는 사람인지" 확인하는 용도뿐이다.
// acting/alumni 같은 role은 여기서 판단하지 않는다 — 가입 직후엔 무조건 alumni로
// 등록되고, admin이 나중에 개별로 acting으로 승격한다.
//
// 필요한 환경변수: NOTION_API_KEY, NOTION_PEOPLE_DATABASE_ID
// 컬럼명이 기본값(기수/Name/이메일)과 다르면 NOTION_COHORT_PROPERTY /
// NOTION_NAME_PROPERTY / NOTION_EMAIL_PROPERTY로 지정한다.
import { prisma } from "@/lib/prisma";
import { extractPropertyText, getNotionClient } from "@/portal/lib/notion";
import { normalizeCohort, normalizeName } from "@/portal/lib/normalize";

export async function syncPeopleDirectory() {
  const cohortProperty = process.env.NOTION_COHORT_PROPERTY ?? "기수";
  const nameProperty = process.env.NOTION_NAME_PROPERTY ?? "Name";
  const emailProperty = process.env.NOTION_EMAIL_PROPERTY ?? "이메일";

  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");

  const notion = getNotionClient();

  const db = (await notion.databases.retrieve({ database_id: databaseId })) as unknown as {
    properties: Record<string, unknown>;
  };
  const availableProps = Object.keys(db.properties ?? {});
  for (const required of [cohortProperty, nameProperty, emailProperty]) {
    if (!availableProps.includes(required)) {
      throw new Error(
        `"${required}" 속성을 찾을 수 없습니다. 실제 속성: ${availableProps.join(", ")}\n` +
          "NOTION_COHORT_PROPERTY / NOTION_NAME_PROPERTY / NOTION_EMAIL_PROPERTY로 실제 컬럼명을 지정하세요.",
      );
    }
  }

  // 가입 요청 중에 돌 수 있어 바뀐 행만 쓴다 — 기존 값을 한 번에 읽어두고 비교.
  const existingRows = await prisma.peopleDirectory.findMany({
    select: { notionPageId: true, cohort: true, name: true, knownEmail: true },
  });
  const existingByPageId = new Map(existingRows.map((r) => [r.notionPageId, r]));

  let cursor: string | undefined;
  let imported = 0;
  let updated = 0;
  const skipped: string[] = [];

  do {
    const page = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const row of page.results) {
      if (!("properties" in row)) continue;
      const props = row.properties as Record<string, unknown>;
      const rowUrl = "url" in row ? (row.url as string) : row.id;

      const cohort = extractPropertyText(props[cohortProperty] as Record<string, unknown>);
      const name = extractPropertyText(props[nameProperty] as Record<string, unknown>);
      const email = extractPropertyText(props[emailProperty] as Record<string, unknown>);

      if (!cohort || !name || !email) {
        skipped.push(`${rowUrl} (기수=${cohort ?? "?"}, 이름=${name ?? "?"})`);
        continue;
      }

      const existing = existingByPageId.get(row.id);
      if (existing && existing.cohort === cohort && existing.name === name && existing.knownEmail === email) {
        continue;
      }

      const data = {
        cohort,
        cohortNormalized: normalizeCohort(cohort),
        name,
        nameNormalized: normalizeName(name),
        knownEmail: email,
      };
      await prisma.peopleDirectory.upsert({
        where: { notionPageId: row.id },
        update: data,
        create: { notionPageId: row.id, ...data },
      });

      if (existing) updated++;
      else imported++;
    }

    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return { imported, updated, skipped };
}
