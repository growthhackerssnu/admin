import { ApiError } from "./errors";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError("VALIDATION_ERROR", "limit은 1 이상의 정수여야 합니다.", {
      fieldErrors: { limit: "1 이상의 정수" },
    });
  }
  return Math.min(parsed, MAX_LIMIT);
}

// 커서는 서버가 발급하는 불투명 문자열이다 (v0.3 §7.1). 지금은 마지막 행의 id를
// base64url로 감싸기만 한다 — 나중에 복합 커서로 바꿔도 클라이언트는 영향받지 않는다.
export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (!/^[A-Za-z0-9_-]+$/.test(decoded)) {
    throw new ApiError("VALIDATION_ERROR", "cursor 값이 올바르지 않습니다.", {
      fieldErrors: { cursor: "서버가 발급한 값이 아님" },
    });
  }
  return decoded;
}

export function parseCursor(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("cursor");
  return raw === null ? null : decodeCursor(raw);
}

// 목록 조회는 항상 limit + 1건을 가져와서 다음 페이지가 있는지 판정한다.
export function takeWithLookahead(limit: number): number {
  return limit + 1;
}

// 두 봉투가 쓰는 값을 모두 돌려준다. 리스트업은 { nextCursor, hasMore }를 page에
// 그대로 싣고, 기존 발송 봉투는 nextCursor만 쓴다(v0.4 §6.1).
export function buildPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last.id) : null, hasMore };
}
