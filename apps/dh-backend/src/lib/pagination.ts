import { ApiError, type PageInfo } from "./errors";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError("INVALID_REQUEST", "limit은 1 이상의 정수여야 합니다.", { limit: raw });
  }
  return Math.min(parsed, MAX_LIMIT);
}

// 커서는 서버가 발급하는 불투명 문자열이다 (명세 §2.2). 지금은 마지막 행의 id를
// base64url로 감싸기만 한다 — 나중에 복합 커서로 바꿔도 클라이언트는 영향받지 않는다.
export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (!/^[A-Za-z0-9_-]+$/.test(decoded)) {
    throw new ApiError("INVALID_REQUEST", "cursor 값이 올바르지 않습니다.", { cursor });
  }
  return decoded;
}

export function parseCursor(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("cursor");
  return raw === null ? null : decodeCursor(raw);
}

// 목록 조회는 항상 limit + 1건을 가져와서 has_more를 판정한다.
export function takeWithLookahead(limit: number): number {
  return limit + 1;
}

export function buildPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; page: PageInfo } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    page: { nextCursor: hasMore && last ? encodeCursor(last.id) : null, hasMore },
  };
}
