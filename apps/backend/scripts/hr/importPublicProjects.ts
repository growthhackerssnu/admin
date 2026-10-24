// 일회성 스크립트: 홈페이지(ghsnu.com/PROJECT)의 프로젝트 소개를 통째로 복사해 저장한다.
//
// 왜: 프로젝트 앱(/projects)은 백서(내부 문서)와 함께 홈페이지 공개 소개를 누구에게나
// 보여주는데, 서버가 홈페이지를 주기적으로 읽지 않게 하려고 한 번 복사해 둔다(2026-10 결정).
//   - 글: 기업명·프로젝트 제목·본문 전체(구역 제목·문단·목록·인용)를
//     src/hr/data/publicProjects.json에 Notion 프로젝트 ID별로 저장한다(커밋 대상).
//   - 이미지: 목록의 기업 로고(썸네일)와 본문 이미지를 Supabase Storage
//     "hr-profile-photos/public-projects/<Notion 프로젝트 ID>/"로 옮긴다.
// 홈페이지 항목은 분기·기업명으로 Notion Projects DB의 프로젝트와 맞춘다
// (src/hr/lib/publicProjectsImport.ts). 못 맞춘 항목은 경고만 하고 건너뛴다.
//
// 홈페이지가 바뀌었을 때 다시 돌리고 JSON을 커밋하면 된다(재실행 안전 — Storage는 같은
// 경로를 덮어쓰고, JSON은 새로 쓴다).
//
// 사용법: npm run public-projects:import [-- --dry-run]
//   --dry-run: 이미지를 올리지 않고 JSON도 쓰지 않는다. 매칭 결과만 출력.
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { PublicBlock, PublicProjectRecord, PublicProjectsFile } from "@/hr/lib/publicProjects";
import {
  LIST_URL,
  matchPublicProjects,
  parseDetail,
  parseGallery,
  type PublicProject,
} from "@/hr/lib/publicProjectsImport";
import { getStorageAdminClient, uploadResizedImage } from "@/hr/lib/profileImage";
import { getWhitepaperList } from "@/hr/lib/whitepapers";

const DRY_RUN = process.argv.includes("--dry-run");
const OUT_FILE = path.join(__dirname, "../../src/hr/data/publicProjects.json");
const REQUEST_GAP_MS = 300; // 홈페이지에 부담을 주지 않게 상세 페이지를 하나씩 천천히 받는다

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ghsnu-admin (+https://admin.ghsnu.com)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const storage = getStorageAdminClient();
  if (!storage && !DRY_RUN) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다(.env.local).");
  }

  const gallery = parseGallery(await fetchText(LIST_URL));
  console.log(`홈페이지 목록: ${gallery.length}건`);

  const publics: PublicProject[] = [];
  for (const item of gallery) {
    await sleep(REQUEST_GAP_MS);
    const detail = parseDetail(await fetchText(item.url));
    if (!detail.nameKo) console.warn(`  ! ${item.label}: 상세 페이지에서 기업명 줄을 못 찾았습니다(${item.url})`);
    publics.push({ ...item, ...detail });
  }

  const notion = await getWhitepaperList();
  const matched = matchPublicProjects(publics, notion);
  const titleById = new Map(notion.map((w) => [w.notionPageId, w.title]));
  const matchedPublics = new Set(matched.values());
  for (const pub of publics) {
    if (!matchedPublics.has(pub)) console.warn(`  ! 못 맞춤(건너뜀): ${pub.label} — ${pub.nameKo ?? "?"} (${pub.url})`);
  }
  for (const [id, pub] of matched) console.log(`  ${pub.label.padEnd(26)} → ${titleById.get(id)}`);
  console.log(`Notion 프로젝트와 맞춘 것: ${matched.size}/${publics.length}건`);
  if (DRY_RUN || !storage) return;

  // 홈페이지 목록 순서(최신 분기 먼저)대로 저장한다.
  const ordered = [...matched].sort(([, a], [, b]) => gallery.findIndex((g) => g.url === a.url) - gallery.findIndex((g) => g.url === b.url));
  const records: PublicProjectRecord[] = [];
  let uploaded = 0;
  for (const [notionPageId, pub] of ordered) {
    const dir = `public-projects/${notionPageId}`;
    const copy = async (sourceUrl: string, file: string, fit: "contain" | "inside") => {
      try {
        const size = fit === "contain" ? { width: 640, height: 360 } : { width: 1600, height: 1600 };
        const { publicUrl } = await uploadResizedImage(storage, { path: `${dir}/${file}`, sourceUrl, fit, ...size });
        uploaded++;
        return publicUrl;
      } catch (err) {
        console.warn(`  ! ${pub.label}: 이미지 복사 실패 ${sourceUrl}`, err);
        return null;
      }
    };

    const thumbnailUrl = pub.imageUrl ? await copy(pub.imageUrl, "thumb.jpg", "contain") : null;
    const copied = new Map<string, string | null>(); // 같은 이미지가 두 번 나오면 한 번만 올린다
    const blocks: PublicBlock[] = [];
    for (const block of pub.blocks) {
      if (block.type !== "image") {
        blocks.push(block);
        continue;
      }
      if (!copied.has(block.url)) copied.set(block.url, await copy(block.url, `${copied.size + 1}.jpg`, "inside"));
      const url = copied.get(block.url);
      // 복사에 실패한 이미지는 홈페이지 주소로 남기지 않고 뺀다(홈페이지에 의존하지 않게).
      if (url) blocks.push({ type: "image", url });
    }

    records.push({
      notionPageId,
      sourceUrl: pub.url,
      label: pub.label,
      nameKo: pub.nameKo,
      nameEn: pub.nameEn,
      headline: pub.headline,
      thumbnailUrl,
      blocks,
    });
    console.log(`  ✓ ${pub.label} (이미지 ${copied.size + (thumbnailUrl ? 1 : 0)}장)`);
  }

  const file: PublicProjectsFile = { importedAt: new Date().toISOString(), projects: records };
  writeFileSync(OUT_FILE, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`저장: ${path.relative(process.cwd(), OUT_FILE)} — ${records.length}건, 이미지 ${uploaded}장 업로드`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
