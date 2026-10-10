import { describe, expect, it } from "vitest";
import { corporateTax, countsForFiscalYear, fiscalYearOf, fiscalYearRange, withholding } from "./taxRepository";

describe("NUT tax", () => {
  it("uses the Dec 1 – Nov 30 fiscal year, starting the first one on 2026-10-11", () => {
    expect(fiscalYearRange(2026)).toEqual({ start: "2026-10-11", end: "2026-11-30" });
    expect(fiscalYearRange(2027)).toEqual({ start: "2026-12-01", end: "2027-11-30" });
    expect(fiscalYearOf("2025-12-15")).toBe(2026);
    expect(fiscalYearOf("2026-11-30")).toBe(2026);
  });

  it("applies the new (2026+) rates because the first business year starts 2026-10-11", () => {
    expect(corporateTax(10_000_000, fiscalYearRange(2026).start).tax).toBe(1_000_000);
    expect(corporateTax(10_000_000, "2025-12-01").tax).toBe(900_000);
    expect(corporateTax(10_000_000, "2026-12-01").tax).toBe(1_000_000);
    // 2억 초과분은 다음 구간: 2억×10% + 1억×20%
    expect(corporateTax(300_000_000, "2026-12-01").tax).toBe(40_000_000);
    expect(corporateTax(0, "2026-12-01").tax).toBe(0);
  });

  it("counts biz card spending before 2026-10-11 but not personal spending", () => {
    expect(countsForFiscalYear("2026-10-10", 2026, true)).toBe(true);
    expect(countsForFiscalYear("2026-10-10", 2026, false)).toBe(false);
    expect(countsForFiscalYear("2026-10-11", 2026, false)).toBe(true);
    expect(countsForFiscalYear("2025-11-30", 2026, true)).toBe(false);
    expect(countsForFiscalYear("2026-12-01", 2026, true)).toBe(false);
  });

  it("withholds 3.3% for business income and 8.8% for other income", () => {
    const result = withholding(1_000_000, 1_000_000);
    expect(result.business.national + result.business.local).toBe(33_000);
    expect(result.other.national + result.other.local).toBe(88_000);
  });
});
