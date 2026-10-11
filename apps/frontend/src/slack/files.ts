// 첨부 파일 분류(사진·동영상·파일), 폴더 안 경로, 사진 압축.
// 압축한 사진은 확장자를 .webp로 바꿔 저장한다(뷰어는 .webp를 먼저 찾고, 없으면 원래 이름을 찾는다).
import { safeName } from "./folder";
import type { SlackFile } from "./types";

export type FileKind = "photos" | "videos" | "files";
export type FileOptions = Record<FileKind, boolean> & {
  compressPhotos: boolean;
};
export const DEFAULT_FILE_OPTIONS: FileOptions = {
  photos: true,
  videos: true,
  files: true,
  compressPhotos: true,
};

export function fileKind(file: SlackFile): FileKind {
  const type = file.mimetype ?? "";
  if (type.startsWith("image/")) return "photos";
  if (type.startsWith("video/")) return "videos";
  return "files";
}

export const filePath = (file: SlackFile) =>
  `files/${file.id}/${safeName(file.name ?? file.id)}`;

// GIF(움직일 수 있음)·SVG·HEIC(브라우저가 못 읽음)는 그대로 둔다.
const COMPRESSIBLE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
]);

export function compressedPath(file: SlackFile) {
  if (!COMPRESSIBLE.has(file.mimetype ?? "")) return null;
  return filePath(file).replace(/(\.[^./]*)?$/, ".webp");
}

/** 저장됐을 수 있는 경로들. 압축본을 먼저 본다. */
export function savedFilePaths(file: SlackFile) {
  const compressed = compressedPath(file);
  return compressed && compressed !== filePath(file)
    ? [compressed, filePath(file)]
    : [filePath(file)];
}

const MAX_SIDE = 2048;
const QUALITY = 0.8;

/** 긴 변 2048px, WebP 품질 0.8. 더 작아지지 않거나 못 읽으면 null(원본을 쓴다). */
export async function compressImage(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await canvas.convertToBlob({
      type: "image/webp",
      quality: QUALITY,
    });
    return out.type === "image/webp" && out.size < blob.size ? out : null;
  } catch {
    return null;
  }
}
