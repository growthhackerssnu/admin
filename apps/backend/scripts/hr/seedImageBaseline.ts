// 일회성 스크립트: 사진 교체 감지의 "기준선"을 한꺼번에 심는다.
//
// 배경: 사진 교체 감지(src/hr/lib/profileImageSync.ts)는 사람마다 "지난번에 본 첫
// 이미지 블록(id·수정 시각)"과 비교한다. 이 기록이 없으면 서버가 요청 뒤 백그라운드로
// 회차당 15명씩 채워 가는데(270명이면 18회차, 방문이 뜸하면 오래 걸림), 배포 직전에
// 이 스크립트로 한 번에 채워 두면 그 대기가 없다.
//
// 하는 일: Profile Image URL이 이미 있는 사람 중 확인 기록이 없는 사람의 첫 이미지 블록을
// 읽어 hr.people_cache의 "image-probe" 키에 기록한다. 이미 있는 기록은 건드리지 않는다.
// Notion·Storage에는 아무것도 쓰지 않는다(읽기만).
//   - 블록이 이관일(MIGRATION_CUTOFF) 이후에 수정된 사람은 "교체됐을 수 있음"이라
//     기록하지 않고 목록으로만 알려준다 → 서버가 알아서 다시 올린다.
//   - URL이 없는 사람(신규)은 서버가 처리하므로 건너뛴다.
//
// 사용법: npm run images:baseline [-- --dry-run]   (--dry-run: DB에 쓰지 않고 집계만 출력)
import { prisma } from "@/lib/prisma";
import { callNotionRateLimited, extractPropertyText, getNotionClient } from "@/hr/lib/notion";
import { fetchFirstImage, PROFILE_IMAGE_PROPERTY } from "@/hr/lib/profileImage";
import { MIGRATION_CUTOFF, PROBE_KEY, type ProbeRecord } from "@/hr/lib/profileImageSync";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
  const notion = getNotionClient();

  const row = await prisma.peopleCache.findUnique({ where: { key: PROBE_KEY } });
  const probes = ((row?.data as unknown as Record<string, ProbeRecord> | undefined) ?? {}) as Record<
    string,
    ProbeRecord
  >;
  console.log(`기존 확인 기록: ${Object.keys(probes).length}건 (${row ? "행 있음" : "행 없음"})`);

  type Target = { pageId: string; name: string; lastEditedTime: string };
  const targets: Target[] = [];
  let noUrl = 0;
  let alreadyRecorded = 0;
  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 }),
    );
    for (const r of page.results) {
      if (!("properties" in r) || !("last_edited_time" in r)) continue;
      const props = r.properties as Record<string, unknown>;
      if (!extractPropertyText(props[PROFILE_IMAGE_PROPERTY])) {
        noUrl++;
        continue;
      }
      if (probes[r.id]) {
        alreadyRecorded++;
        continue;
      }
      targets.push({
        pageId: r.id,
        name: extractPropertyText(props["Name"]) ?? r.id,
        lastEditedTime: r.last_edited_time,
      });
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  console.log(
    `URL 없음(서버가 처리) ${noUrl}명, 이미 기록 있음 ${alreadyRecorded}명, 기준선을 심을 대상 ${targets.length}명 (--dry-run=${DRY_RUN})`,
  );

  let recorded = 0;
  let noImageBlock = 0;
  let failed = 0;
  const maybeReplaced: string[] = [];

  for (const [i, t] of targets.entries()) {
    try {
      const image = await fetchFirstImage(t.pageId);
      if (!image) {
        probes[t.pageId] = { lastEditedTime: t.lastEditedTime, checkedAt: Date.now(), hasImage: false };
        noImageBlock++;
      } else if (image.blockEditedTime >= MIGRATION_CUTOFF) {
        maybeReplaced.push(`${t.name}(블록 수정 ${image.blockEditedTime})`);
      } else {
        probes[t.pageId] = {
          lastEditedTime: t.lastEditedTime,
          checkedAt: Date.now(),
          hasImage: true,
          blockId: image.blockId,
          blockEditedTime: image.blockEditedTime,
        };
        recorded++;
      }
    } catch (err) {
      failed++;
      console.error(`[${i + 1}/${targets.length}] ${t.name}: 실패`, err);
    }
    if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${targets.length}`);
  }

  console.log(
    `
기준선 기록 ${recorded}명, 본문에 이미지 블록 없음 ${noImageBlock}명, 실패 ${failed}명, 교체 의심(기록 안 함) ${maybeReplaced.length}명`,
  );
  if (maybeReplaced.length > 0) console.log("교체 의심:", maybeReplaced.join(", "));

  if (DRY_RUN) {
    console.log("--dry-run: DB에 쓰지 않았습니다.");
    return;
  }
  await prisma.peopleCache.upsert({
    where: { key: PROBE_KEY },
    create: { key: PROBE_KEY, data: probes as unknown as object, fetchedAt: new Date() },
    update: { data: probes as unknown as object, fetchedAt: new Date() },
  });
  console.log(`hr.people_cache "${PROBE_KEY}" 저장 완료 (총 ${Object.keys(probes).length}건)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
