// 일회성 스크립트: Notion People DB 각 사람 본문의 프로필 사진(image 블록)을
// 내려받아 리사이즈한 뒤 Supabase Storage에 올리고, 그 영구 URL을 Notion의
// "Profile Image URL"(URL 타입) 속성에 써넣는다.
//
// 왜 필요한가(ARCHITECTURE.md §4, worklog §39~40): 프로필 사진이 본문 블록에만
// 있으면 people_cache["list"]를 채울 때마다 사람 수만큼 Notion을 따로 불러야
// 해서(N+1), 실측 결과 261~271명 기준 캐시 만료 직후 첫 요청자가 약 100초를
// 기다려야 했다. 사진을 한 번만 옮겨서 속성으로 만들어두면, 그 뒤로는 다른
// 속성들과 똑같이 query-data-source 한 번에 같이 딸려온다.
//
// 재실행해도 안전하다 — upsert(Storage는 파일 덮어쓰기, Notion은 속성 PATCH)라
// 이미 옮긴 사람을 건너뛰지 않고 다시 하면 최신 사진으로 갱신될 뿐이다. 이미
// "Profile Image URL"이 채워진 사람은 기본적으로 건너뛴다(--force로 전체 재실행).
//
// 사용법: npm run images:migrate [-- --force]
//
// (2026-09-30) 신규 등록분은 이제 서버가 디렉토리 목록을 만들 때 자동으로 옮긴다
// (src/hr/lib/profileImageSync.ts). 이 스크립트는 전체 재이관(--force)이나
// 자동 동기화를 기다리지 않고 한 번에 돌리고 싶을 때만 쓴다. 사진 처리 규칙은
// 자동 동기화와 같은 src/hr/lib/profileImage.ts를 공유한다.
import { createClient } from "@supabase/supabase-js";
import { callNotionRateLimited, extractPropertyText, getNotionClient } from "@/hr/lib/notion";
import {
  fetchFirstImageUrl,
  PROFILE_IMAGE_PROPERTY as IMAGE_URL_PROPERTY,
  uploadProfileImage,
} from "@/hr/lib/profileImage";

const FORCE = process.argv.includes("--force");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : undefined;
const PAGE_IDS_ARG = process.argv.find((a) => a.startsWith("--pageIds="));
const ONLY_PAGE_IDS = PAGE_IDS_ARG ? new Set((PAGE_IDS_ARG.split("=")[1] ?? "").split(",")) : undefined;

async function main() {
  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseId) throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");

  const notion = getNotionClient();
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  type Target = { pageId: string; name: string; hasImageUrl: boolean };
  const targets: Target[] = [];

  // 1. 대상 목록: 전원(속성 조회는 페이지네이션 몇 번이면 끝, 빠르다).
  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 }),
    );
    for (const row of page.results) {
      if (!("properties" in row)) continue;
      const props = row.properties as Record<string, unknown>;
      const name = extractPropertyText(props["Name"]) ?? row.id;
      const existing = extractPropertyText(props[IMAGE_URL_PROPERTY]);
      targets.push({ pageId: row.id, name, hasImageUrl: Boolean(existing) });
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  let filtered = FORCE ? targets : targets.filter((t) => !t.hasImageUrl);
  if (ONLY_PAGE_IDS) filtered = filtered.filter((t) => ONLY_PAGE_IDS.has(t.pageId));
  const todo = LIMIT ? filtered.slice(0, LIMIT) : filtered;
  console.log(
    `전체 ${targets.length}명 중 처리 대상 ${filtered.length}명 (--force=${FORCE})${LIMIT ? `, 이번엔 ${todo.length}명만(--limit)` : ""}`,
  );

  let migrated = 0;
  let noImage = 0;
  let failed = 0;

  for (const [i, target] of todo.entries()) {
    try {
      const imageUrl = await fetchFirstImageUrl(target.pageId);
      if (!imageUrl) {
        noImage++;
        console.log(`[${i + 1}/${todo.length}] ${target.name}: 본문에 이미지 없음, 건너뜀`);
        continue;
      }

      const { publicUrl, originalBytes, resizedBytes } = await uploadProfileImage(
        supabase,
        target.pageId,
        imageUrl,
      );

      await callNotionRateLimited(() =>
        notion.pages.update({
          page_id: target.pageId,
          properties: { [IMAGE_URL_PROPERTY]: { url: publicUrl } },
        }),
      );

      migrated++;
      console.log(
        `[${i + 1}/${todo.length}] ${target.name}: ${(originalBytes / 1024).toFixed(0)}KB → ${(resizedBytes / 1024).toFixed(0)}KB 완료`,
      );
    } catch (err) {
      failed++;
      console.error(`[${i + 1}/${todo.length}] ${target.name}: 실패`, err);
    }
  }

  console.log(`\n완료: 마이그레이션 ${migrated}명, 이미지 없음 ${noImage}명, 실패 ${failed}명`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
