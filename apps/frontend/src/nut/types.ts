export type TaxClass =
  | "non_taxable_gain"
  | "taxable_gain"
  | "tax_deductible_expense"
  | "non_tax_deductible_expense"
  | "tax";

export type LedgerType = "income" | "expense";
export type ClaimStatus = "review" | "approved" | "paid" | "rejected";
export type BucketKind = "income" | "expense" | "tax";
export type BucketLevel = "major" | "middle" | "minor";

export interface BudgetNode {
  id: string;
  name: string;
  parentId: string | null;
  level: BucketLevel;
  kind: BucketKind;
  taxClass: TaxClass;
  budget: number;
  spent: number;
  actual: number;
  remaining: number;
  variance: number;
  order: number;
  formula?: string;
  formulaKey?: string;
  formulaExpression?: string;
  note?: string;
}

export interface BudgetParameter {
  id: string;
  label: string;
  value: number;
  unit: string;
  description: string;
  category: string;
  sortOrder: number;
}

// 직접 입력하지 않고 다른 기준에서 계산되는 값(19기 총원 = 대협+HR+PR 등).
export interface DerivedParameter {
  id: string;
  label: string;
  category: string;
  unit: string;
  expression: string;
  value: number;
}

export interface BudgetLine {
  id: string;
  name: string;
  parentId: string;
  taxClass: TaxClass;
  budget: number;
  spent: number;
  actual: number;
  remaining: number;
  variance: number;
  note?: string;
}

export interface IncomeLine {
  id: string;
  name: string;
  budget: number;
  actual: number;
  remaining: number;
  variance: number;
  sortOrder: number;
  note?: string;
  taxClass: TaxClass;
}

export interface MonthlyFlow {
  month: string;
  label: string;
  budget: number;
  actual: number;
  remaining: number;
  variance: number;
  income: number;
}

export interface LedgerEntry {
  id: string;
  date: string;
  month: number;
  type: LedgerType;
  bucket: string;
  detail: string;
  income: number;
  expense: number;
  balance: number;
  amount: number;
  claimant?: string;
  note?: string;
  source: string;
  taxClass: TaxClass;
  claimId?: string;
  teamId?: string;
}

// 팀이 지정된 회계 행(거래 내역)을 팀별로 모은 것. id는 회계 행 id.
export interface AccountingDetail {
  id: string;
  teamId: string;
  scope: "project" | "team";
  owner: string;
  category: "support" | "technical";
  date: string;
  detail: string;
  amount: number;
  balance: number;
  claimant?: string;
}

export interface AccountingSummary {
  id: string;
  scope: "project" | "team";
  term: "summer" | "regular" | "";
  name: string;
  supportBudget: number;
  supportSpent: number;
  technicalBudget: number;
  technicalSpent: number;
  entryCount: number;
  note?: string;
}

export interface Claim {
  id: string;
  date: string;
  detail: string;
  amount: number;
  claimant: string;
  bucket: string;
  status: ClaimStatus;
  source: string;
  prepaid: boolean;
  mine: boolean;
  bankAccount?: string;
  note?: string;
  rejectReason?: string;
  reviewedAt?: string;
  paidAt?: string;
  ledgerEntryId?: string;
}

export interface RefundAccount {
  id: string;
  name: string;
  cohort?: string;
  email?: string;
  bankAccount: string;
}

export interface PeriodSummary {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface TaxSummary {
  taxableGains: number;
  nonTaxableGains: number;
  deductibleExpenses: number;
  nonDeductibleExpenses: number;
  freelanceContractCost: number;
  corporateTax: number;
  withholdingTax: number;
  vat: number;
  totalTax: number;
}

export interface FinanceOverview {
  periods: PeriodSummary[];
  // 고치기(모든 쓰기)는 총무·admin만. false면 화면은 보기 전용.
  viewer: { canEdit: boolean; canEditAttendance: boolean };
  period: {
    id: string;
    label: string;
    operatingCohort: number;
    start: string;
    end: string;
    asOf: string;
  };
  fiscalYear: { label: string; start: string; end: string };
  openingCash: number;
  currentCash: number;
  incomeBudget: number;
  incomeActual: number;
  expenseBudget: number;
  expenseActual: number;
  plan: { income: number; expense: number; net: number };
  actual: { income: number; expense: number; net: number };
  variance: { income: number; expense: number; net: number };
  remaining: { income: number; expense: number; net: number };
  budgetTree: BudgetNode[];
  parameters: BudgetParameter[];
  derivedParameters: DerivedParameter[];
  budgetLines: BudgetLine[];
  incomeLines: IncomeLine[];
  monthlyFlows: MonthlyFlow[];
  ledger: LedgerEntry[];
  accountingDetails: AccountingDetail[];
  accountingSummaries: AccountingSummary[];
  claims: Claim[];
  // 총무·admin에게만 내려온다. 그 외에는 빈 배열.
  refundAccounts: RefundAccount[];
  tax: TaxSummary;
}

export interface TaxOverview {
  fiscalYear: number;
  fiscalYears: number[];
  range: { start: string; end: string };
  taxStart: string;
  filingDue: string;
  totals: {
    taxableGains: number;
    nonTaxableGains: number;
    deductibleExpenses: number;
    nonDeductibleExpenses: number;
  };
  corporate: {
    businessIncome: number;
    reserveRate: number;
    reserve: number;
    taxBase: number;
    tax: number;
    lines: Array<{ from: number; to: number; rate: number; tax: number }>;
    rates: number[];
    newRates: boolean;
    local: number;
    total: number;
  };
  vat: Array<{
    key: string;
    start: string;
    end: string;
    due: string;
    receipts: number;
    included: boolean;
    supply: number;
    outputTax: number;
    inputTax: number;
    payable: number;
  }>;
  withholding: {
    business: { paid: number; national: number; local: number };
    other: { paid: number; national: number; local: number };
  };
  entries: Array<{
    id: string;
    date: string;
    type: LedgerType;
    bucket: string;
    detail: string;
    amount: number;
    taxClass: TaxClass;
  }>;
}

export type AttendanceType = "late" | "absent" | "quest";
export type Excuse = "excused" | "partial" | "unexcused";

export type AttendanceRecord = {
  id: string;
  date: string;
  name: string;
  project: string | null;
  type: AttendanceType;
  excuse: Excuse;
  minutesLate: number | null;
  note: string | null;
  source: string;
  penalty: {
    label: string;
    points: number;
    fine: number;
    needsMinutes?: boolean;
  };
};

export type AttendanceData = {
  sessionMinutes: number;
  rules: Array<{ id: string; label: string; points: number; fine: number }>;
  roster: Array<{ name: string; cohort: string | null }>;
  records: AttendanceRecord[];
};
