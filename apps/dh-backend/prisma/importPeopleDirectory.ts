// 노션 People DB(액팅 기수 + 알럼나이 전체) -> people_directory 동기화.
// 재실행해도 안전하다(notionPageId 기준 upsert). 노션 쪽 명단이 바뀌면 다시 돌리면 됨.
//
// 이 테이블은 "가입 신청한 사람이 진짜 명단에 있는 사람인지" 확인하는 용도뿐이다.
// acting/alumni 같은 role은 여기서 판단하지 않는다 — 가입 직후엔 무조건 alumni로
// 등록되고, admin이 나중에 개별로 acting으로 승격한다.
//
// 사용법: npm run people:import
// 필요한 환경변수: NOTION_API_KEY, NOTION_PEOPLE_DATABASE_ID
// 컬럼명이 기본값(기수/Name/이메일)과 다르면 NOTION_COHORT_PROPERTY /
// NOTION_NAME_PROPERTY / NOTION_EMAIL_PROPERTY로 지정한다.
import { PrismaClient } from "@prisma/client";
import { extractPropertyText, getNotionClient, normalizeCohort, normalizeName } from "../src/lib/notion";

const prisma = new PrismaClient();

const COHORT_PROPERTY = process.env.NOTION_COHORT_PROPERTY ?? "기수";
const NAME_PROPERTY = process.env.NOTION_NAME_PROPERTY ?? "Name";
const EMAIL_PROPERTY = process.env.NOTION_EMAIL_PROPERTY ?? "이메일";

async function main() {
  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) {
    console.error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
    process.exit(1);
  }

  const notion = getNotionClient();

  const db = (await notion.databases.retrieve({ database_id: databaseId })) as unknown as {
    properties: Record<string, unknown>;
  };
  const availableProps = Object.keys(db.properties ?? {});
  for (const required of [COHORT_PROPERTY, NAME_PROPERTY, EMAIL_PROPERTY]) {
    if (!availableProps.includes(required)) {
      console.error(
        `"${required}" 속성을 찾을 수 없습니다. 실제 속성: ${availableProps.join(", ")}\n` +
          "NOTION_COHORT_PROPERTY / NOTION_NAME_PROPERTY / NOTION_EMAIL_PROPERTY로 실제 컬럼명을 지정하세요.",
      );
      process.exit(1);
    }
  }

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

      const cohort = extractPropertyText(props[COHORT_PROPERTY] as Record<string, unknown>);
      const name = extractPropertyText(props[NAME_PROPERTY] as Record<string, unknown>);
      const email = extractPropertyText(props[EMAIL_PROPERTY] as Record<string, unknown>);

      if (!cohort || !name || !email) {
        skipped.push(`${rowUrl} (기수=${cohort ?? "?"}, 이름=${name ?? "?"}, 이메일=${email ?? "?"})`);
        continue;
      }

      const existing = await prisma.peopleDirectory.findUnique({ where: { notionPageId: row.id } });

      await prisma.peopleDirectory.upsert({
        where: { notionPageId: row.id },
        update: {
          cohort,
          cohortNormalized: normalizeCohort(cohort),
          name,
          nameNormalized: normalizeName(name),
          knownEmail: email,
        },
        create: {
          notionPageId: row.id,
          cohort,
          cohortNormalized: normalizeCohort(cohort),
          name,
          nameNormalized: normalizeName(name),
          knownEmail: email,
        },
      });

      if (existing) updated++;
      else imported++;
    }

    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  console.log(`가져오기 완료: 신규 ${imported}건, 갱신 ${updated}건, 건너뜀 ${skipped.length}건`);
  if (skipped.length > 0) {
    console.log("건너뛴 행(기수/이름/이메일 중 하나가 비어있음):");
    skipped.forEach((s) => console.log(`  - ${s}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
