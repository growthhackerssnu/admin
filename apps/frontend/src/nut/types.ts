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
// 언제 내는 돈인지: 매 반기, 봄·여름 반기만, 가을·겨울 반기만, 이번 반기만(새 반기로 복사하지 않음).
export type Billing = "every" | "spring" | "fall" | "once";

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
  // 항목 자체 금액(직접 입력 또는 계산식). 결제 시기가 아닌 반기에는 budget이 0이어도 이 값은 남는다.
  amount: number;
  billing: Billing;
  offSeason: boolean;
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
  // true = 개인 카드(돌려줄 돈, 영수증 필요), false = 법인카드.
  prepaid: boolean;
  slackLink?: string;
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
  viewer: { canEdit: boolean };
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
  // 아직 시작하지 않은 반기에서만: 지금 통장 잔액 = 바로 전 반기의 잔액.
  carriedCash?: { periodId: string; label: string; amount: number };
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
    // 청구서로 들어온 행만: 법인카드 / 개인 카드(영수증은 slackLink 스레드).
    card?: "biz" | "personal";
    slackLink?: string;
  }>;
}

export type AttendanceType = "late" | "absent" | "quest";
export type Excuse = "excused" | "partial" | "unexcused";

export type AttendanceRecord = {
  id: string;
  date: string;
  name: string;
  // 사람을 묶는 키. 이메일 없는 예전 기록은 서버가 이름으로 회원을 찾아 채운다.
  email: string | null;
  // acting이 아니게 된 회원의 기록이라 합계에서 뺀다.
  former: boolean;
  project: string | null;
  type: AttendanceType;
  excuse: Excuse;
  minutesLate: number | null;
  // 직접 고른 지각 구간(규칙 id). null이면 자동.
  tier: string | null;
  note: string | null;
  source: string;
  penalty: {
    label: string;
    points: number;
    fine: number;
    needsMinutes?: boolean;
    // 직접 고른 구간으로 매긴 벌점.
    manual?: boolean;
  };
  // 벌점 초기화 날짜 이전 기록이라 합계에 들어가지 않는다.
  cleared: boolean;
};

export type AttendanceData = {
  period: { id: string; label: string; start: string; end: string };
  periods: Array<{ id: string; label: string }>;
  canEdit: boolean;
  clearedThrough: string | null;
  sessionMinutes: number;
  rules: Array<{ id: string; label: string; points: number; fine: number }>;
  roster: Array<{ email: string; name: string; cohort: string | null }>;
  records: AttendanceRecord[];
};
