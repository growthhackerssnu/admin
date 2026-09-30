import { describe, expect, it } from "vitest";
import { decideImageAction, isProbeDue, type ImageCandidate, type ProbeRecord } from "./profileImageSync";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-01T12:00:00Z");

function candidate(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return { notionPageId: "p1", name: "이름", lastEditedTime: "2026-10-01T10:00:00.000Z", hasImageUrl: false, ...overrides };
}
function record(overrides: Partial<ProbeRecord> = {}): ProbeRecord {
  return {
    lastEditedTime: "2026-10-01T10:00:00.000Z",
    checkedAt: NOW - HOUR,
    hasImage: true,
    blockId: "b1",
    blockEditedTime: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}
const image = { url: "https://notion/x", blockId: "b1", blockEditedTime: "2026-09-01T00:00:00.000Z" };

describe("isProbeDue", () => {
  it("확인 기록이 없으면 확인한다", () => {
    expect(isProbeDue(candidate(), undefined, NOW)).toBe(true);
    expect(isProbeDue(candidate({ hasImageUrl: true }), undefined, NOW)).toBe(true);
  });

  it("페이지 수정 시각이 같으면 확인하지 않는다", () => {
    expect(isProbeDue(candidate({ hasImageUrl: true }), record(), NOW)).toBe(false);
  });

  it("페이지가 수정됐으면 확인한다", () => {
    const c = candidate({ hasImageUrl: true, lastEditedTime: "2026-10-01T11:00:00.000Z" });
    expect(isProbeDue(c, record(), NOW)).toBe(true);
  });

  it("URL이 비어 있으면 24시간 지난 뒤 안전망으로 재확인한다", () => {
    const old = record({ hasImage: false, checkedAt: NOW - 25 * HOUR });
    expect(isProbeDue(candidate(), old, NOW)).toBe(true);
    expect(isProbeDue(candidate(), record({ hasImage: false, checkedAt: NOW - 23 * HOUR }), NOW)).toBe(false);
  });

  it("URL이 있는 정상 기록은 시간이 지나도 안전망으로 재확인하지 않는다", () => {
    expect(isProbeDue(candidate({ hasImageUrl: true }), record({ checkedAt: NOW - 100 * HOUR }), NOW)).toBe(false);
  });

  it("실패한 기록은 URL이 있어도 24시간 뒤 재시도한다", () => {
    expect(isProbeDue(candidate({ hasImageUrl: true }), record({ failed: true, checkedAt: NOW - 25 * HOUR }), NOW)).toBe(true);
  });
});

describe("decideImageAction", () => {
  it("URL이 비어 있고 이미지가 있으면 신규 업로드", () => {
    expect(decideImageAction(candidate(), undefined, image)).toBe("upload");
  });

  it("URL이 있고 확인 기록이 없으면 기준선만 기록(업로드 안 함)", () => {
    expect(decideImageAction(candidate({ hasImageUrl: true }), undefined, image)).toBe("record-only");
  });

  it("기준선이 없어도 블록이 이관일(9/28) 이후에 수정됐으면 교체로 보고 업로드", () => {
    expect(
      decideImageAction(candidate({ hasImageUrl: true }), undefined, { ...image, blockEditedTime: "2026-09-29T03:00:00.000Z" }),
    ).toBe("upload");
  });

  it("URL이 있고 블록이 그대로면 기록만", () => {
    expect(decideImageAction(candidate({ hasImageUrl: true }), record(), image)).toBe("record-only");
  });

  it("블록 id가 바뀌면(다른 사진으로 교체) 업로드", () => {
    expect(decideImageAction(candidate({ hasImageUrl: true }), record(), { ...image, blockId: "b2" })).toBe("upload");
  });

  it("같은 블록이라도 블록 수정 시각이 바뀌면 업로드", () => {
    expect(
      decideImageAction(candidate({ hasImageUrl: true }), record(), { ...image, blockEditedTime: "2026-10-01T09:00:00.000Z" }),
    ).toBe("upload");
  });

  it("이전에 이미지가 없던 기록(사진 없음 → 이제 있음)이라도 URL이 비어 있으면 업로드", () => {
    expect(decideImageAction(candidate(), record({ hasImage: false, blockId: undefined }), image)).toBe("upload");
  });
});
