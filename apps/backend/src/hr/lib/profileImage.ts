// 프로필 사진 한 장을 "Notion 본문 → 리사이즈 → Supabase Storage → 공개 URL"로
// 옮기는 공용 조각. 일회성 스크립트(scripts/hr/migrateProfileImages.ts)와
// 신규 등록 자동 동기화(profileImageSync.ts)가 같은 규칙을 쓰도록 한 곳에 둔다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { callNotionRateLimited, getNotionClient } from "./notion";

export const PROFILE_IMAGE_BUCKET = "hr-profile-photos";
export const PROFILE_IMAGE_PROPERTY = "Profile Image URL";
const RESIZE_SIZE = 800; // 프로필 상세 헤더 크기 기준(가장 크게 쓰는 곳), 카드는 이걸 축소해서 씀
const JPEG_QUALITY = 82;

// 서버 런타임에서 Storage에 쓰려면 service_role 키가 필요하다(RLS 우회). 없으면
// null — 호출부가 "이번엔 건너뜀"으로 처리한다(키 미설정이 서비스 장애가 되면 안 됨).
export function getStorageAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type FirstImage = {
  url: string;
  // 사진이 교체됐는지 알아내는 데 쓴다. URL은 Notion이 조회 때마다 새로 서명해서 매번
  // 달라지므로 비교할 수 없고, 블록 id(다른 사진으로 교체=새 블록)와 블록 수정 시각
  // (같은 블록의 파일을 바꿈)으로 비교한다.
  blockId: string;
  blockEditedTime: string;
};

// 본문 맨 앞 블록이 image면 그 정보, 아니면 null. Notion 자체 업로드 파일의
// 서명 URL은 약 1시간 뒤 만료되므로 받은 즉시 내려받아야 한다.
export async function fetchFirstImage(pageId: string): Promise<FirstImage | null> {
  const notion = getNotionClient();
  const children = await callNotionRateLimited(() =>
    notion.blocks.children.list({ block_id: pageId, page_size: 1 }),
  );
  const first = children.results[0] as
    | {
        id?: string;
        last_edited_time?: string;
        type?: string;
        image?: { type?: string; file?: { url?: string }; external?: { url?: string } };
      }
    | undefined;
  if (!first || first.type !== "image" || !first.image || !first.id) return null;
  const url =
    first.image.type === "file"
      ? first.image.file?.url
      : first.image.type === "external"
        ? first.image.external?.url
        : undefined;
  if (!url) return null;
  return { url, blockId: first.id, blockEditedTime: first.last_edited_time ?? "" };
}

export async function fetchFirstImageUrl(pageId: string): Promise<string | null> {
  return (await fetchFirstImage(pageId))?.url ?? null;
}

// 내려받기 → 리사이즈 → 업로드까지 하고 공개 URL을 돌려준다(Notion 속성 쓰기는
// 호출부가 한다 — 스크립트와 자동 동기화가 각자 방식이 달라서).
export async function uploadProfileImage(
  storage: SupabaseClient,
  pageId: string,
  sourceUrl: string,
): Promise<{ publicUrl: string; originalBytes: number; resizedBytes: number }> {
  return uploadResizedImage(storage, {
    path: `${pageId}.jpg`,
    sourceUrl,
    width: RESIZE_SIZE,
    height: RESIZE_SIZE,
    fit: "cover",
  });
}

// 프로필 사진·프로젝트 썸네일(whitepaperThumbnails.ts)·홈페이지 소개 복사본
// (scripts/hr/importPublicProjects.ts)이 같이 쓰는 본체. 모두 같은 공개 버킷에 경로만
// 나눠 둔다("whitepapers/"·"public-projects/" — 버킷을 새로 만들지 않으려고).
export async function uploadResizedImage(
  storage: SupabaseClient,
  opts: {
    path: string;
    sourceUrl: string;
    // 기본은 공개 버킷(PROFILE_IMAGE_BUCKET). 백서 본문 이미지는 비공개 버킷에 둔다.
    bucket?: string;
    width: number;
    height: number;
    // cover: 꽉 채우고 잘라냄(사진). contain: 전부 보이게 줄이고 남는 곳은 흰색(로고).
    // inside: 비율 그대로 이 크기 안에 들어가게만 줄임(본문 이미지, 작으면 키우지 않음).
    fit: "cover" | "contain" | "inside";
  },
): Promise<{ publicUrl: string; path: string; originalBytes: number; resizedBytes: number }> {
  const bucket = opts.bucket ?? PROFILE_IMAGE_BUCKET;
  const original = await fetch(opts.sourceUrl);
  if (!original.ok) throw new Error(`이미지 다운로드 실패: HTTP ${original.status}`);
  const originalBuffer = Buffer.from(await original.arrayBuffer());

  // .rotate(): 폰 사진은 픽셀은 가로로 둔 채 EXIF Orientation 태그로 "세워서 보라"고만
  // 적어 두는 경우가 많다. sharp는 출력할 때 EXIF를 버리므로, 그 전에 태그대로 픽셀을
  // 실제로 돌려 두지 않으면 사진이 옆으로 누운 채 저장된다.
  const resized = await sharp(originalBuffer)
    .rotate()
    .resize(opts.width, opts.height, {
      fit: opts.fit,
      background: "#ffffff",
      withoutEnlargement: opts.fit === "inside",
    })
    .flatten({ background: "#ffffff" }) // 투명 PNG 로고가 JPEG에서 검게 나오지 않게
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const { error } = await storage.storage
    .from(bucket)
    // cacheControl 1년: 같은 경로를 덮어쓰지 않는 한 안 바뀐다 — egress 절약.
    .upload(opts.path, resized, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = storage.storage.from(bucket).getPublicUrl(opts.path);

  // 같은 경로에 덮어쓰므로(사진 교체 시) 브라우저가 1년 캐시(cacheControl)를 든 채
  // 옛 사진을 계속 보여주지 않도록, 저장하는 URL에 버전(?v=)을 붙인다. 브라우저는 주소
  // 전체를 열쇠로 캐시하므로 ?v 값이 바뀌면 새 파일로 받는다. Storage는 쿼리스트링을
  // 무시하고 같은 파일을 준다.
  return {
    publicUrl: `${publicUrl}?v=${Date.now()}`,
    path: opts.path,
    originalBytes: originalBuffer.length,
    resizedBytes: resized.length,
  };
}
