import { describe, expect, it } from "vitest";
import { recentUpdateLabel } from "./quarter";

describe("recentUpdateLabel (KST 기준 분기)", () => {
  it("분기 경계를 KST로 판단한다", () => {
    // 2026-09-30 23:59 KST = 14:59 UTC → 아직 3Q
    expect(recentUpdateLabel(new Date("2026-09-30T14:59:00Z"))).toBe("26-3Q");
    // 2026-10-01 00:00 KST = 09-30 15:00 UTC → 4Q
    expect(recentUpdateLabel(new Date("2026-09-30T15:00:00Z"))).toBe("26-4Q");
  });

  it("각 분기의 시작·끝", () => {
    expect(recentUpdateLabel(new Date("2026-01-01T00:00:00+09:00"))).toBe("26-1Q");
    expect(recentUpdateLabel(new Date("2026-03-31T23:59:59+09:00"))).toBe("26-1Q");
    expect(recentUpdateLabel(new Date("2026-04-01T00:00:00+09:00"))).toBe("26-2Q");
    expect(recentUpdateLabel(new Date("2026-06-30T23:59:59+09:00"))).toBe("26-2Q");
    expect(recentUpdateLabel(new Date("2026-07-01T00:00:00+09:00"))).toBe("26-3Q");
    expect(recentUpdateLabel(new Date("2026-12-31T23:59:59+09:00"))).toBe("26-4Q");
  });

  it("연도 경계: UTC로는 전년 12월이어도 KST가 새해면 새해 1Q", () => {
    // 2026-12-31 15:00 UTC = 2027-01-01 00:00 KST
    expect(recentUpdateLabel(new Date("2026-12-31T15:00:00Z"))).toBe("27-1Q");
  });

  it("예시: 26년 10월 5일 수정 → 26-4Q", () => {
    expect(recentUpdateLabel(new Date("2026-10-05T12:00:00+09:00"))).toBe("26-4Q");
  });
});
