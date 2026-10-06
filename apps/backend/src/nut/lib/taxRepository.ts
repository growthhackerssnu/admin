import { prisma } from "@/lib/prisma";

// 세금 탭. 회계연도(사업연도)는 12월 1일 ~ 11월 30일이라 운영팀 반기와 다르다.
// 회계연도 N = (N-1)년 12월 1일 ~ N년 11월 30일. 계산은 모든 반기의 회계 행을 날짜로 모아서 한다.
// 수익·비용이 과세 대상인지는 회계 행의 세금 분류(taxClass)를 따른다 — 세금 탭에서 바로 고칠 수 있다.

const toNumber = (value: bigint | number | null | undefined) => Number(value ?? 0);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const utc = (value: string) => new Date(`${value}T00:00:00Z`);

export function fiscalYearRange(fy: number) {
  return { start: `${fy - 1}-12-01`, end: `${fy}-11-30` };
}

export function fiscalYearOf(date: string) {
  const [year, month] = date.split("-").map(Number);
  return month === 12 ? year! + 1 : year!;
}

// 법인세율: 2026년 1월 1일 이후 시작하는 사업연도부터 구간별 1%p 인상(2025.12 개정 법인세법 제55조).
// 회계연도가 12월에 시작하므로 FY2026(2025-12-01 시작)까지는 종전 세율, FY2027부터 새 세율.
const BRACKETS = {
  before2026: [
    { upTo: 200_000_000, rate: 0.09 },
    { upTo: 20_000_000_000, rate: 0.19 },
    { upTo: 300_000_000_000, rate: 0.21 },
    { upTo: Infinity, rate: 0.24 },
  ],
  from2026: [
    { upTo: 200_000_000, rate: 0.1 },
    { upTo: 20_000_000_000, rate: 0.2 },
    { upTo: 300_000_000_000, rate: 0.22 },
    { upTo: Infinity, rate: 0.25 },
  ],
};

export function corporateTax(taxBase: number, fyStart: string) {
  const brackets = fyStart >= "2026-01-01" ? BRACKETS.from2026 : BRACKETS.before2026;
  let tax = 0;
  let lower = 0;
  const lines: Array<{ from: number; to: number; rate: number; tax: number }> = [];
  for (const bracket of brackets) {
    if (taxBase <= lower) break;
    const portion = Math.min(taxBase, bracket.upTo) - lower;
    const part = Math.floor(portion * bracket.rate);
    lines.push({ from: lower, to: Math.min(taxBase, bracket.upTo), rate: bracket.rate, tax: part });
    tax += part;
    lower = bracket.upTo;
  }
  return { tax, lines, rates: brackets.map((bracket) => bracket.rate) };
}

// 원천징수: 사업소득 3%(+지방 0.3%), 기타소득은 필요경비 60% 뒤 20%(+지방 2%) = 지급액의 8.8%.
export function withholding(businessPaid: number, otherPaid: number) {
  const businessNational = Math.floor((businessPaid * 0.03) / 10) * 10;
  const otherNational = Math.floor((otherPaid * 0.4 * 0.2) / 10) * 10;
  return {
    business: { paid: businessPaid, national: businessNational, local: Math.floor(businessNational * 0.1 / 10) * 10 },
    other: { paid: otherPaid, national: otherNational, local: Math.floor(otherNational * 0.1 / 10) * 10 },
  };
}

async function inputs(keys: string[]) {
  const rows = await prisma.nutTaxInput.findMany({ where: { key: { in: keys } } });
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function setTaxInput(key: string, value: number) {
  await prisma.nutTaxInput.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function getTaxOverview(requestedFy?: number | null) {
  const bounds = await prisma.nutLedgerEntry.aggregate({ _min: { transactionDate: true }, _max: { transactionDate: true } });
  const today = new Date().toISOString().slice(0, 10);
  const first = fiscalYearOf(bounds._min.transactionDate ? dateOnly(bounds._min.transactionDate) : today);
  const last = Math.max(fiscalYearOf(bounds._max.transactionDate ? dateOnly(bounds._max.transactionDate) : today), fiscalYearOf(today));
  const fiscalYears = Array.from({ length: last - first + 1 }, (_, index) => last - index);
  const fy = requestedFy && fiscalYears.includes(requestedFy) ? requestedFy : fiscalYearOf(today);
  const range = fiscalYearRange(fy);

  // 부가세는 달력 기준 1기(1~6월)·2기(7~12월). 이 회계연도와 겹치는 기를 모두 보여준다.
  const startYear = Number(range.start.slice(0, 4));
  const vatPeriods = [
    { key: `${startYear}-2`, start: `${startYear}-07-01`, end: `${startYear}-12-31`, due: `${startYear + 1}-01-25` },
    { key: `${fy}-1`, start: `${fy}-01-01`, end: `${fy}-06-30`, due: `${fy}-07-25` },
    { key: `${fy}-2`, start: `${fy}-07-01`, end: `${fy}-12-31`, due: `${fy + 1}-01-25` },
  ];
  const earliest = vatPeriods[0]!.start;
  const latest = vatPeriods[2]!.end;
  const entries = await prisma.nutLedgerEntry.findMany({
    where: { transactionDate: { gte: utc(earliest < range.start ? earliest : range.start), lte: utc(latest > range.end ? latest : range.end) } },
    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
  });
  const inFy = entries.filter((entry) => {
    const date = dateOnly(entry.transactionDate);
    return date >= range.start && date <= range.end;
  });

  const sum = (rows: typeof entries, taxClass: string, field: "income" | "expense") =>
    rows.filter((row) => row.taxClass === taxClass).reduce((total, row) => total + toNumber(row[field]), 0);
  const totals = {
    taxableGains: sum(inFy, "taxable_gain", "income"),
    nonTaxableGains: sum(inFy, "non_taxable_gain", "income"),
    deductibleExpenses: sum(inFy, "tax_deductible_expense", "expense"),
    nonDeductibleExpenses: sum(inFy, "non_tax_deductible_expense", "expense"),
  };

  const keys = [
    `fy:${fy}:reserve-rate`,
    `fy:${fy}:business-paid`,
    `fy:${fy}:other-paid`,
    ...vatPeriods.flatMap((period) => [`vat:${period.key}:input-tax`, `vat:${period.key}:vat-included`]),
  ];
  const stored = await inputs(keys);

  // 법인세: 수익사업 소득 = 과세 수익 − 손금. 고유목적사업준비금(비율)을 빼면 과세표준.
  const businessIncome = Math.max(0, totals.taxableGains - totals.deductibleExpenses);
  const reserveRate = stored.get(`fy:${fy}:reserve-rate`) ?? 0;
  const reserve = Math.floor((businessIncome * reserveRate) / 100);
  const taxBase = businessIncome - reserve;
  const corporate = corporateTax(taxBase, range.start);
  const corporateLocal = Math.floor(corporate.tax * 0.1 / 10) * 10;

  const vat = vatPeriods.map((period) => {
    const rows = entries.filter((entry) => {
      const date = dateOnly(entry.transactionDate);
      return date >= period.start && date <= period.end;
    });
    const receipts = sum(rows, "taxable_gain", "income");
    const included = (stored.get(`vat:${period.key}:vat-included`) ?? 1) === 1;
    const supply = included ? Math.round(receipts / 1.1) : receipts;
    const outputTax = Math.round(supply * 0.1);
    const inputTax = stored.get(`vat:${period.key}:input-tax`) ?? 0;
    return { ...period, receipts, included, supply, outputTax, inputTax, payable: outputTax - inputTax };
  });

  const withheld = withholding(stored.get(`fy:${fy}:business-paid`) ?? 0, stored.get(`fy:${fy}:other-paid`) ?? 0);

  return {
    fiscalYear: fy,
    fiscalYears,
    range,
    filingDue: `${fy + 1}-02-${new Date(Date.UTC(fy + 1, 2, 0)).getUTCDate()}`,
    totals,
    corporate: {
      businessIncome,
      reserveRate,
      reserve,
      taxBase,
      tax: corporate.tax,
      lines: corporate.lines,
      rates: corporate.rates,
      newRates: range.start >= "2026-01-01",
      local: corporateLocal,
      total: corporate.tax + corporateLocal,
    },
    vat,
    withholding: withheld,
    entries: inFy.map((entry) => ({
      id: entry.id,
      date: dateOnly(entry.transactionDate),
      type: entry.type,
      bucket: entry.bucket,
      detail: entry.detail,
      amount: toNumber(entry.income) || toNumber(entry.expense),
      taxClass: entry.taxClass,
    })),
  };
}
