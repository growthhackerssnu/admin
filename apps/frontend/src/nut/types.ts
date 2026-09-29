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

export interface BudgetBucket {
  id: string;
  name: string;
  parentId: string | null;
  kind: BucketKind;
  taxClass: TaxClass;
  budget: number;
  spent: number;
  actual: number;
  remaining: number;
  variance: number;
  description?: string;
}

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
  source: "Excel import" | "Slack" | "Manual";
  taxClass: TaxClass;
}

export interface AccountingDetail {
  id: string;
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
  source: "Slack";
  prepaid: boolean;
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
  period: {
    id: string;
    label: string;
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
  buckets: BudgetBucket[];
  budgetTree: BudgetNode[];
  parameters: BudgetParameter[];
  budgetLines: BudgetLine[];
  incomeLines: IncomeLine[];
  monthlyFlows: MonthlyFlow[];
  ledger: LedgerEntry[];
  accountingDetails: AccountingDetail[];
  accountingSummaries: AccountingSummary[];
  claims: Claim[];
  tax: TaxSummary;
  reconciliation: {
    status: "review" | "matched";
    difference: number;
    cashDifference: number;
    ledgerDifference: number;
    note: string;
  };
}
