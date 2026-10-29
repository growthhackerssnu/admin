// 노션 People DB(액팅 기수 + 알럼나이 전체) -> people_directory 동기화.
// 재실행해도 안전하다(notionPageId 기준 upsert).
//
// 두 곳에서 부른다:
//   - app/api/auth/signup-requests — 가입 신청이 명단에 없을 때. 새 기수는 1년에
//     두 번뿐이라 주기 실행 대신 필요할 때만 노션을 확인한다.
//   - scripts/portal/importPeopleDirectory.ts — 수동 실행.
//
//   - src/portal/lib/notionMemberSync.ts — 주기 실행(Inngest)과 npm run members:sync.
//
// 이 테이블은 "가입 신청한 사람이 진짜 명단에 있는 사람인지" 확인하는 용도다.
//
// 노션 명단에 새로 생긴 사람(이름·기수·이메일이 다 있는 행)은 회원으로 자동 가입시킨다 —
// 노션 이메일로 members 행을 만들고 이 행을 그 회원 것으로 표시한다. role은 노션의 가장 최근
// 기수면 acting(새로 들어온 학회원), 아니면 alumni다(옛 기수를 뒤늦게 채워 넣은 경우).
// 운영팀 직책은 여기서 넣지 않고 opsRoleSync가 노션 "직책"·"소속팀"에서 옮긴다.
// 이미 그 이메일의 회원이 있으면 새로 만들지 않고 연결만 한다.
//
// 필요한 환경변수: NOTION_API_KEY, NOTION_PEOPLE_DATABASE_ID
// 컬럼명이 기본값(기수/Name/이메일)과 다르면 NOTION_COHORT_PROPERTY /
// NOTION_NAME_PROPERTY / NOTION_EMAIL_PROPERTY로 지정한다.
import { prisma } from "@/lib/prisma";
import { extractPropertyText, getNotionClient } from "@/portal/lib/notion";
import { normalizeCohort, normalizeName } from "@/portal/lib/normalize";
import { notifyNewMember, type NewMember } from "@/portal/lib/newMemberNotice";
import { notionOpsValues, type NotionOpsValues } from "@/portal/lib/opsRoleSync";

type NewRow = { notionPageId: string; cohort: string; name: string; email: string };

export async function syncPeopleDirectory({ dryRun = false } = {}) {
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
  const pages: NotionOpsValues[] = [];
  const newRows: NewRow[] = [];
  let latestCohort = 0;

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

      pages.push(notionOpsValues(row.id, props));
      latestCohort = Math.max(latestCohort, Number(cohort ? normalizeCohort(cohort) : 0) || 0);

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
      if (existing) updated++;
      else {
        imported++;
        newRows.push({ notionPageId: row.id, cohort, name, email });
      }
      if (dryRun) continue;
      await prisma.peopleDirectory.upsert({
        where: { notionPageId: row.id },
        update: data,
        // 직책 기준값은 "비어 있음"으로 시작한다 — 노션에 직책·소속팀이 있으면 opsRoleSync가 노션에서 바뀐 것으로 보고 옮긴다.
        create: { notionPageId: row.id, ...data, notionOpsRoles: [], opsRolesSyncedAt: new Date() },
      });
    }

    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const created: NewMember[] = [];
  const linked: string[] = [];
  for (const row of newRows) {
    const role = Number(normalizeCohort(row.cohort)) === latestCohort ? "acting" : "alumni";
    const signedUp = await autoSignup(row, role, dryRun).catch((error) => {
      console.error(`[people-directory] auto signup failed: ${row.notionPageId}`, error);
      return null;
    });
    if (signedUp === "linked") linked.push(`${row.cohort}기 ${row.name}`);
    else if (signedUp) created.push(signedUp);
  }
  if (!dryRun) for (const member of created) await notifyNewMember(member);

  return { imported, updated, skipped, created, linked, pages };
}

// 노션 이메일로 회원을 만들고 명단 행을 그 회원 것으로 표시한다. 이미 그 이메일의 회원이 있으면
// (관리자가 먼저 등록했거나 가입 이메일이 같은 경우) 연결만 한다 — 이미 다른 행에 연결돼 있으면 둔다.
async function autoSignup(row: NewRow, role: "acting" | "alumni", dryRun: boolean): Promise<NewMember | "linked" | null> {
  const email = row.email.toLowerCase();
  const existing = await prisma.member.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { claimedPersonEntry: { select: { id: true } } },
  });
  if (existing) {
    if (existing.claimedPersonEntry) return null;
    if (!dryRun) {
      await prisma.peopleDirectory.update({
        where: { notionPageId: row.notionPageId },
        data: { claimedByMemberId: existing.id, claimedAt: new Date() },
      });
    }
    return "linked";
  }
  const member: NewMember = { name: row.name, cohort: row.cohort, email, role, source: "notion" };
  if (dryRun) return member;
  await prisma.$transaction(async (tx) => {
    const added = await tx.member.create({ data: { email, displayName: row.name, role } });
    await tx.peopleDirectory.update({
      where: { notionPageId: row.notionPageId },
      data: { claimedByMemberId: added.id, claimedAt: new Date() },
    });
  });
  return member;
}
