import { describe, expect, it } from "vitest";
import { corporateTax, fiscalYearOf, fiscalYearRange, withholding } from "./taxRepository";

describe("NUT tax", () => {
  it("uses the Dec 1 – Nov 30 fiscal year", () => {
    expect(fiscalYearRange(2026)).toEqual({ start: "2025-12-01", end: "2026-11-30" });
    expect(fiscalYearOf("2025-12-15")).toBe(2026);
    expect(fiscalYearOf("2026-11-30")).toBe(2026);
  });

  it("applies the pre-2026 rates to FY2026 (starts 2025-12-01) and the new rates from FY2027", () => {
    expect(corporateTax(10_000_000, "2025-12-01").tax).toBe(900_000);
    expect(corporateTax(10_000_000, "2026-12-01").tax).toBe(1_000_000);
    // 2억 초과분은 다음 구간: 2억×10% + 1억×20%
    expect(corporateTax(300_000_000, "2026-12-01").tax).toBe(40_000_000);
    expect(corporateTax(0, "2026-12-01").tax).toBe(0);
  });

  it("withholds 3.3% for business income and 8.8% for other income", () => {
    const result = withholding(1_000_000, 1_000_000);
    expect(result.business.national + result.business.local).toBe(33_000);
    expect(result.other.national + result.other.local).toBe(88_000);
  });
});
