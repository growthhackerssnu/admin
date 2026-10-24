// 프로젝트(백서) 썸네일 동기화.
//
// Notion에 올린 이미지 URL은 약 1시간 뒤 만료되므로 그대로 쓸 수 없다. 프로필 사진
// (profileImageSync.ts)처럼 Supabase Storage로 옮겨 영구 URL을 쓴다. 고르는 순서:
//   ① 기업 DB의 "로고"(Projects DB엔 rollup으로 들어온다) — 지금은 비어 있지만 채우면 쓴다.
//   ② 백서 본문의 맨 첫 블록이 이미지면 그 이미지. 실제로는 대부분 기업 로고라
//      잘라내지 않고 전부 보이게(남는 곳은 흰색) 줄인다. 본문 중간의 차트는 안 쓴다.
//   ③ 둘 다 없으면 null — 프런트가 기업명으로 기본 썸네일을 그린다.
//
// 기록(hr.people_cache의 "whitepaper-thumbnails" 키, 스키마 변경 없음)에 프로젝트별로
// 페이지 수정 시각과 "어느 이미지를 올렸는지"(source)를 남긴다. 서명 URL은 조회 때마다
// 달라져 비교할 수 없어서, 로고는 쿼리스트링을 뗀 파일 경로, 본문 이미지는 블록 id +
// 블록 수정 시각으로 비교한다. 본문은 페이지 수정 시각이 바뀌었을 때만 다시 확인한다.
//
// 목록을 Notion에서 다시 만들 때 응답을 먼저 돌려주고 백그라운드로 돌린다. 한 번에
// 처리하는 양을 제한한다(다 못 하면 다음 재구성 때 이어서).
import { prisma } from "@/lib/prisma";
import { CACHE_TTL_MS, memoryDelete, memoryGet, memorySet } from "./memoryCache";
import { fetchFirstImage, getStorageAdminClient, uploadResizedImage } from "./profileImage";

const STORE_KEY = "whitepaper-thumbnails";
const MAX_PROBES_PER_RUN = 20; // 본문 첫 블록 확인(Notion 호출) 수 — 사용자 요청이 밀리지 않게
const MAX_UPLOADS_PER_RUN = 8;
const WIDTH = 640;
const HEIGHT = 360;

export type ThumbnailCandidate = {
  notionPageId: string;
  lastEditedTime: string;
  logoUrl: string | null;
};

type ThumbnailRecord = {
  lastEditedTime: string;
  source: string | null;
  url: string | null;
  failed?: boolean;
};
type ThumbnailStore = Record<string, ThumbnailRecord>;

async function readStore(): Promise<ThumbnailStore> {
  const row = await prisma.peopleCache.findUnique({ where: { key: STORE_KEY } });
  return (row?.data as unknown as ThumbnailStore | undefined) ?? {};
}

// 목록·상세 응답에 붙일 썸네일 URL(프로젝트 ID → URL).
export async function getThumbnailUrls(): Promise<Record<string, string>> {
  const inMemory = memoryGet<Record<string, string>>(STORE_KEY, CACHE_TTL_MS);
  if (inMemory) return inMemory;
  const store = await readStore();
  const urls = Object.fromEntries(
    Object.entries(store).flatMap(([id, rec]) => (rec.url ? [[id, rec.url]] : [])),
  );
  memorySet(STORE_KEY, urls);
  return urls;
}

let running = false;

export function scheduleThumbnailSync(candidates: ThumbnailCandidate[]): void {
  if (candidates.length === 0 || running) return;
  running = true;
  void syncThumbnails(candidates)
    .catch((err) => console.error("[whitepaper-thumbnails] 실패", err))
    .finally(() => {
      running = false;
    });
}

async function syncThumbnails(candidates: ThumbnailCandidate[]): Promise<void> {
  // service_role 키가 없으면(로컬 등) 올릴 수 없다 — 기본 썸네일로 둔다.
  const storage = getStorageAdminClient();
  if (!storage) return;

  const store = await readStore();
  let probes = 0;
  let uploads = 0;
  let changed = false;

  // 최근에 수정된 페이지부터.
  const ordered = [...candidates].sort((a, b) => b.lastEditedTime.localeCompare(a.lastEditedTime));
  for (const c of ordered) {
    if (uploads >= MAX_UPLOADS_PER_RUN) break;
    const rec = store[c.notionPageId];

    let image: { source: string; url: string } | null;
    if (c.logoUrl) {
      image = { source: `logo:${stripQuery(c.logoUrl)}`, url: c.logoUrl };
    } else {
      // 로고가 지워졌거나 예전 형식의 기록이면 다시 확인한다.
      const unchanged =
        rec && rec.lastEditedTime === c.lastEditedTime && (rec.source === null || rec.source.startsWith("image:"));
      if (unchanged) continue;
      if (probes >= MAX_PROBES_PER_RUN) continue;
      probes++;
      const first = await fetchFirstImage(c.notionPageId);
      image = first ? { source: `image:${first.blockId}:${first.blockEditedTime}`, url: first.url } : null;
    }

    if (!image) {
      store[c.notionPageId] = { lastEditedTime: c.lastEditedTime, source: null, url: null };
      changed = true;
      continue;
    }
    // 같은 이미지를 이미 올렸으면 건너뛴다. 실패했던 이미지는 페이지가 수정됐을 때만 다시 시도한다.
    const retryFailed = rec?.failed && rec.lastEditedTime !== c.lastEditedTime;
    if (rec?.source === image.source && !retryFailed) {
      if (rec.lastEditedTime !== c.lastEditedTime) {
        store[c.notionPageId] = { ...rec, lastEditedTime: c.lastEditedTime };
        changed = true;
      }
      continue;
    }

    uploads++;
    try {
      const { publicUrl } = await uploadResizedImage(storage, {
        path: `whitepapers/${c.notionPageId}.jpg`,
        sourceUrl: image.url,
        width: WIDTH,
        height: HEIGHT,
        fit: "contain",
      });
      store[c.notionPageId] = { lastEditedTime: c.lastEditedTime, source: image.source, url: publicUrl };
    } catch (err) {
      // 깨진 이미지를 5분마다 다시 시도하지 않도록 기록해두고, 페이지가 수정되면 다시 본다.
      console.error(`[whitepaper-thumbnails] ${c.notionPageId} 업로드 실패`, err);
      store[c.notionPageId] = { lastEditedTime: c.lastEditedTime, source: image.source, url: rec?.url ?? null, failed: true };
    }
    changed = true;
  }

  if (!changed) return;
  await prisma.peopleCache.upsert({
    where: { key: STORE_KEY },
    create: { key: STORE_KEY, data: store as unknown as object, fetchedAt: new Date() },
    update: { data: store as unknown as object, fetchedAt: new Date() },
  });
  memoryDelete(STORE_KEY);
}

function stripQuery(url: string): string {
  return url.split("?")[0] ?? url;
}
