import { describe, expect, it } from "vitest";
import { autoInputTax, corporateTax, countsForFiscalYear, fiscalYearOf, fiscalYearRange, vatToExclude, withholding } from "./taxRepository";

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

  it("estimates input VAT as 10/110 of deductible spending; card-less claims need a tax invoice", () => {
    const result = autoInputTax([
      { expense: 11_000, taxClass: "tax_deductible_expense", payMethod: "biz_card" },
      { expense: 22_000, taxClass: "tax_deductible_expense", payMethod: "biz_transfer", taxInvoice: true },
      { expense: 33_000, taxClass: "tax_deductible_expense" },
      { expense: 55_000, taxClass: "tax_deductible_expense", payMethod: "personal_card" },
      { expense: 44_000, taxClass: "tax_deductible_expense", payMethod: "biz_transfer" },
      { expense: 77_000, taxClass: "tax_deductible_expense", payMethod: "personal_card", taxInvoice: true },
      { expense: 99_000, taxClass: "non_tax_deductible_expense", payMethod: "biz_card" },
    ]);
    expect(result).toEqual({ spend: 143_000, count: 4, tax: 13_000 });
  });

  it("excludes output VAT from taxable gains and credited input VAT from expenses for corporate tax", () => {
    const rows = [
      { income: 1_100_000, expense: 0, taxClass: "taxable_gain" },
      { income: 500_000, expense: 0, taxClass: "non_taxable_gain" },
      { income: 0, expense: 110_000, taxClass: "tax_deductible_expense", payMethod: "biz_card" as const },
      // 공제 못 받는 매입세액(개인카드, 증빙 없음)은 비용에 그대로 남는다
      { income: 0, expense: 55_000, taxClass: "tax_deductible_expense", payMethod: "personal_card" as const },
    ];
    expect(vatToExclude(rows, true)).toEqual({ output: 100_000, input: 10_000 });
    // 입금액에 부가세가 없으면 매출 쪽은 뺄 게 없다
    expect(vatToExclude(rows, false).output).toBe(0);
    // 직접 고친 매입세액이 있으면 그걸 뺀다
    expect(vatToExclude(rows, true, 7_000).input).toBe(7_000);
  });
});
