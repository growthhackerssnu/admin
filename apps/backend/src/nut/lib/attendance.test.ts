import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { DEFAULT_RULES, penalty } = await import("./attendance");

const late = (excuse: "partial" | "unexcused", minutesLate: number | null) => penalty({ type: "late", excuse, minutesLate });

// 벌점벌금(여름+에듀) 탭의 열과 수식(벌점 1·3·1·2·5·3·5·1·2, 벌금 0·1만·5천·1만·2만·1만·2만·5천·1만)과 같은지.
describe("penalty", () => {
  it("grades unexcused lateness by share of a 3-hour session like the sheet", () => {
    expect(late("unexcused", 6)).toMatchObject({ label: "무단지각(<5%)", points: 1, fine: 5000 }); // 이수정 6분
    expect(late("unexcused", 9)).toMatchObject({ label: "무단지각(5~30%)", points: 2, fine: 10000 }); // 5% 경계
    expect(late("unexcused", 39)).toMatchObject({ label: "무단지각(5~30%)", points: 2, fine: 10000 }); // 한지원 39분
    expect(late("unexcused", 60)).toMatchObject({ label: "무단지각(>30%)", points: 5, fine: 20000 });
  });

  it("charges partial excuses and absences", () => {
    expect(late("partial", 15)).toMatchObject({ points: 1, fine: 0 });
    expect(late("partial", 60)).toMatchObject({ points: 3, fine: 10000 });
    expect(penalty({ type: "absent", excuse: "partial", minutesLate: null })).toMatchObject({ points: 3, fine: 10000 });
    expect(penalty({ type: "absent", excuse: "unexcused", minutesLate: null })).toMatchObject({ points: 5, fine: 20000 });
    expect(penalty({ type: "quest", excuse: "unexcused", minutesLate: null })).toMatchObject({ points: 2, fine: 10000 });
  });

  it("never charges a full excuse and waits for minutes before charging lateness", () => {
    expect(penalty({ type: "absent", excuse: "excused", minutesLate: null })).toMatchObject({ points: 0, fine: 0 });
    expect(late("unexcused", null)).toMatchObject({ points: 0, needsMinutes: true });
  });

  it("uses the period's own rates and session length", () => {
    const rules = {
      sessionMinutes: 120,
      rates: { ...DEFAULT_RULES.rates, "late-unexcused-5to30": { points: 4, fine: 15000 } },
    };
    // 9분은 3시간 기준으론 5% 경계지만 2시간 기준으론 7.5%다.
    expect(penalty({ type: "late", excuse: "unexcused", minutesLate: 9 }, rules)).toMatchObject({ points: 4, fine: 15000 });
    expect(penalty({ type: "late", excuse: "unexcused", minutesLate: 5 }, rules)).toMatchObject({ points: 1, fine: 5000 });
  });
});
