// 백서 본문 이미지 — 비공개 Storage 버킷 + 서명 URL.
//
// Notion 이미지 URL은 약 1시간 뒤 만료된다. 그래서 예전엔 백서 캐시를 5분만 들고 매번
// Notion을 다시 읽었고(페이지당 ~10초), 이를 없애려고 이미지를 백서를 만들 때 한 번
// Storage로 옮긴다. 백서는 내부 문서라 공개 버킷(프로필 사진·썸네일)이 아니라 비공개
// 버킷에 두고, 본문을 볼 수 있는 사람의 응답에만 1시간짜리 서명 URL을 붙인다.
//
// service_role 키가 없거나 복사에 실패하면 Notion URL을 그대로 두고, 그 백서 캐시는
// URL이 만료되기 전에 다시 만들도록 expiresAt을 짧게 잡는다(whitepapers.ts).
import { getStorageAdminClient, uploadResizedImage } from "./profileImage";

export const WHITEPAPER_IMAGE_BUCKET = "hr-whitepaper-images";
const SIGNED_URL_SECONDS = 60 * 60;
// Notion 서명 URL을 그대로 쓸 때 캐시를 들고 있을 최대 시간(만료 1시간보다 여유 있게).
export const NOTION_URL_SAFE_MS = 45 * 60 * 1000;

// 이미지 블록 모양만 안다(순환 import를 피하려고 whitepapers.ts의 타입을 가져오지 않음).
type ImageLike = { type: string; url?: string | null; storagePath?: string; imageKey?: string };
type BlockLike = ImageLike & { children?: BlockLike[]; columns?: BlockLike[][] };

function* walk(blocks: BlockLike[]): Generator<BlockLike> {
  for (const b of blocks) {
    yield b;
    if (b.children) yield* walk(b.children);
    for (const col of b.columns ?? []) yield* walk(col);
  }
}

let bucketReady: Promise<void> | null = null;

// 비공개 버킷이 없으면 만든다(처음 한 번). 이미 있으면 "already exists" 오류를 무시한다.
function ensureBucket(storage: NonNullable<ReturnType<typeof getStorageAdminClient>>): Promise<void> {
  bucketReady ??= storage.storage
    .createBucket(WHITEPAPER_IMAGE_BUCKET, { public: false })
    .then(({ error }) => {
      if (error && !/already exists|duplicate/i.test(error.message)) throw error;
    })
    .catch((err: unknown) => {
      bucketReady = null; // 다음에 다시 시도
      throw err;
    });
  return bucketReady;
}

// 본문의 이미지 블록을 비공개 버킷으로 옮기고 storagePath로 바꾼다(url은 지움).
// 반환값: Notion 서명 URL이 하나라도 남았는지 — 남았으면 캐시를 오래 들면 안 된다.
export async function copyWhitepaperImages(pageId: string, blocks: BlockLike[]): Promise<boolean> {
  const images = [...walk(blocks)].filter((b) => b.type === "image" && b.url && b.imageKey);
  const otherSigned = [...walk(blocks)].some((b) => b.type !== "image" && isNotionSigned(b.url));
  if (images.length === 0) return otherSigned;

  const storage = getStorageAdminClient();
  if (!storage) return true;
  try {
    await ensureBucket(storage);
  } catch (err) {
    console.error("[whitepaper-images] 비공개 버킷을 준비하지 못했습니다.", err);
    return true;
  }

  let leftover = otherSigned;
  for (const img of images) {
    try {
      const { path } = await uploadResizedImage(storage, {
        bucket: WHITEPAPER_IMAGE_BUCKET,
        // 같은 블록이라도 이미지가 바뀌면(imageKey에 블록 수정 시각 포함) 새 경로가 된다.
        path: `${pageId}/${img.imageKey}.jpg`,
        sourceUrl: img.url!,
        width: 1600,
        height: 1600,
        fit: "inside",
      });
      img.storagePath = path;
      img.url = null;
    } catch (err) {
      console.error(`[whitepaper-images] ${pageId} 이미지 복사 실패`, err);
      leftover = leftover || isNotionSigned(img.url);
    }
  }
  return leftover;
}

// 응답 직전에 storagePath마다 서명 URL을 붙인다(원본 블록은 건드리지 않고 복사본을 돌려줌).
export async function signWhitepaperImages<T extends BlockLike>(blocks: T[]): Promise<T[]> {
  const copy = structuredClone(blocks);
  for (const b of walk(copy)) delete b.imageKey; // 내부용 값은 응답에 싣지 않는다
  const stored = [...walk(copy)].filter((b) => b.storagePath);
  if (stored.length === 0) return copy;

  const storage = getStorageAdminClient();
  if (!storage) return copy;
  const { data, error } = await storage.storage
    .from(WHITEPAPER_IMAGE_BUCKET)
    .createSignedUrls(
      stored.map((b) => b.storagePath!),
      SIGNED_URL_SECONDS,
    );
  if (error) {
    console.error("[whitepaper-images] 서명 URL 생성 실패", error);
    return copy;
  }
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  for (const b of stored) {
    b.url = byPath.get(b.storagePath!) ?? null;
    delete b.storagePath;
  }
  return copy;
}

function isNotionSigned(url: string | null | undefined): boolean {
  return Boolean(url && /X-Amz-|secure\.notion-static|prod-files-secure/.test(url));
}
