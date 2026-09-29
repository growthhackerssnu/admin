import { describe, expect, it } from "vitest";
import type { ApiError } from "./errors";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  buildPage,
  decodeCursor,
  encodeCursor,
  parseCursor,
  parseLimit,
} from "./pagination";

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return (err as ApiError).code;
  }
  return "NO_ERROR";
}

const query = (search: string) => new URLSearchParams(search);

describe("limit", () => {
  it("없으면 기본값, 최대치를 넘으면 잘린다", () => {
    expect(parseLimit(query(""))).toBe(DEFAULT_LIMIT);
    expect(parseLimit(query("limit=5"))).toBe(5);
    expect(parseLimit(query("limit=500"))).toBe(MAX_LIMIT);
  });

  it("정수가 아니거나 1 미만이면 VALIDATION_ERROR", () => {
    expect(codeOf(() => parseLimit(query("limit=0")))).toBe("VALIDATION_ERROR");
    expect(codeOf(() => parseLimit(query("limit=abc")))).toBe("VALIDATION_ERROR");
    expect(codeOf(() => parseLimit(query("limit=1.5")))).toBe("VALIDATION_ERROR");
  });
});

describe("cursor", () => {
  it("인코딩한 값을 그대로 되돌린다", () => {
    expect(decodeCursor(encodeCursor("clx123abc"))).toBe("clx123abc");
  });

  it("없으면 null, 깨진 값이면 VALIDATION_ERROR(422)", () => {
    expect(parseCursor(query(""))).toBeNull();
    expect(parseCursor(query(`cursor=${encodeCursor("clx1")}`))).toBe("clx1");
    expect(codeOf(() => parseCursor(query("cursor=!!not-base64!!")))).toBe("VALIDATION_ERROR");
  });
});

describe("buildPage", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}` }));

  it("limit+1건이 오면 마지막 1건을 잘라내고 다음 커서를 준다", () => {
    const { items, nextCursor } = buildPage(rows(4), 3);
    expect(items).toHaveLength(3);
    expect(nextCursor).toBe(encodeCursor("id2"));
  });

  it("딱 맞거나 모자라면 커서가 null이다 — 다음 페이지 없음을 뜻한다", () => {
    expect(buildPage(rows(3), 3).nextCursor).toBeNull();
    expect(buildPage(rows(0), 3).nextCursor).toBeNull();
  });
});
