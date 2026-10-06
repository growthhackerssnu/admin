import { Prisma, type PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/portal/lib/normalize";

type DbClient = PrismaClient | Prisma.TransactionClient;

// 화면을 보는 사람. 청구서 계좌번호는 수정 권한자(총무·admin)와 본인에게만 보인다.
export type FinanceViewer = { memberId: string; canEdit: boolean };

// 요청한 반기가 없으면 오늘이 속한 반기, 그것도 없으면 가장 최근 반기.
export async function resolvePeriodId(requested?: string | null, db: DbClient = prisma) {
  if (requested) {
    const found = await db.nutFinancePeriod.findUnique({ where: { id: requested }, select: { id: true } });
    if (!found) throw new Error(`반기 '${requested}'를 찾을 수 없습니다.`);
    return found.id;
  }
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const current = await db.nutFinancePeriod.findFirst({
    where: { periodStart: { lte: today }, periodEnd: { gte: today } },
    select: { id: true },
  });
  if (current) return current.id;
  const latest = await db.nutFinancePeriod.findFirst({ orderBy: { periodStart: "desc" }, select: { id: true } });
  if (!latest) throw new Error("NUT 반기가 하나도 없습니다.");
  return latest.id;
}

const toNumber = (value: bigint | number | null | undefined) =>
  Number(value ?? 0);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const ledgerOrder = (id: string) =>
  Number(id.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);

const legacyFormulaExpressions: Record<string, string> = {
  slack:
    "round(8.75 * 1500 * (cohort-19 * 4.5 + cohort-20 * 3) / 10000) * 10000",
  summerSupport: "80000 * summer-participants",
  summerTech: "260000 * summer-teams + 100000",
  nextSupport: "130000 * next-participants",
  nextTech: "450000 * next-teams",
  hrSupport: "30000 * (hr-19 * 2 + hr-20)",
  prSupport: "30000 * (pr-19 * 2 + pr-20)",
  businessSupport: "30000 * (business-19 * 2 + business-20)",
};

type FormulaToken =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "punctuation"; value: "(" | ")" | "," };

function tokenizeFormula(expression: string): FormulaToken[] {
  if (expression.length > 500)
    throw new Error("산출식은 500자 이내로 작성해야 합니다.");
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (!char || /\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const match = expression.slice(index).match(/^\d+(?:\.\d+)?/);
      if (!match) throw new Error("산출식의 숫자를 읽을 수 없습니다.");
      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = expression.slice(index).match(/^[A-Za-z][A-Za-z0-9_-]*/);
      if (!match) throw new Error("산출식의 변수명을 읽을 수 없습니다.");
      tokens.push({ type: "identifier", value: match[0] });
      index += match[0].length;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")" || char === ",") {
      tokens.push({ type: "punctuation", value: char });
      index += 1;
      continue;
    }
    throw new Error(`산출식에 사용할 수 없는 문자입니다: ${char}`);
  }
  if (!tokens.length) throw new Error("산출식을 입력하세요.");
  return tokens;
}

export function evaluateFormula(
  expression: string,
  values: Map<string, number>,
) {
  const tokens = tokenizeFormula(expression);
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const expectPunctuation = (value: "(" | ")" | ",") => {
    const token = take();
    if (!token || token.type !== "punctuation" || token.value !== value) {
      throw new Error(`산출식에 '${value}'가 필요합니다.`);
    }
  };
  const parseExpression = (): number => {
    let value = parseTerm();
    while (true) {
      const token = peek();
      if (
        !token ||
        token.type !== "operator" ||
        (token.value !== "+" && token.value !== "-")
      )
        break;
      take();
      const right = parseTerm();
      value = token.value === "+" ? value + right : value - right;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseUnary();
    while (true) {
      const token = peek();
      if (
        !token ||
        token.type !== "operator" ||
        (token.value !== "*" && token.value !== "/")
      )
        break;
      take();
      const right = parseUnary();
      if (token.value === "/" && right === 0)
        throw new Error("산출식에서 0으로 나눌 수 없습니다.");
      value = token.value === "*" ? value * right : value / right;
    }
    return value;
  };
  const parseUnary = (): number => {
    const token = peek();
    if (
      token?.type === "operator" &&
      (token.value === "+" || token.value === "-")
    ) {
      take();
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    const token = take();
    if (!token) throw new Error("산출식이 끝나기 전에 값이 부족합니다.");
    if (token.type === "number") return token.value;
    if (token.type === "punctuation" && token.value === "(") {
      const value = parseExpression();
      expectPunctuation(")");
      return value;
    }
    if (token.type !== "identifier")
      throw new Error("산출식에 변수 또는 숫자가 필요합니다.");
    if (peek()?.type === "punctuation" && peek()?.value === "(") {
      take();
      const args: number[] = [];
      if (!(peek()?.type === "punctuation" && peek()?.value === ")")) {
        args.push(parseExpression());
        while (peek()?.type === "punctuation" && peek()?.value === ",") {
          take();
          args.push(parseExpression());
        }
      }
      expectPunctuation(")");
      const onlyArg = args[0];
      if (token.value === "round" && args.length === 1 && onlyArg !== undefined)
        return Math.round(onlyArg);
      if (token.value === "floor" && args.length === 1 && onlyArg !== undefined)
        return Math.floor(onlyArg);
      if (token.value === "ceil" && args.length === 1 && onlyArg !== undefined)
        return Math.ceil(onlyArg);
      if (token.value === "abs" && args.length === 1 && onlyArg !== undefined)
        return Math.abs(onlyArg);
      if (token.value === "min" && args.length > 0) return Math.min(...args);
      if (token.value === "max" && args.length > 0) return Math.max(...args);
      throw new Error(`지원하지 않는 산출식 함수입니다: ${token.value}`);
    }
    const value = values.get(token.value);
    if (value === undefined)
      throw new Error(`환경설정 변수 '${token.value}'를 찾을 수 없습니다.`);
    return value;
  };
  const result = parseExpression();
  if (index !== tokens.length || !Number.isFinite(result))
    throw new Error("산출식을 해석할 수 없습니다.");
  return Math.round(result);
}

function formulaExpressionFor(
  formulaExpression: string | null,
  formulaKey: string | null,
) {
  return (
    formulaExpression ??
    (formulaKey ? (legacyFormulaExpressions[formulaKey] ?? null) : null)
  );
}

function formulaUsesParameter(expression: string | null, id: string) {
  if (!expression) return false;
  return tokenizeFormula(expression).some(
    (token) => token.type === "identifier" && token.value === id,
  );
}

type NodeSnapshot = {
  id: string;
  name: string;
  parentId: string | null;
  level: "major" | "middle" | "minor";
  kind: "income" | "expense" | "tax";
  taxClass:
    | "non_taxable_gain"
    | "taxable_gain"
    | "tax_deductible_expense"
    | "non_tax_deductible_expense"
    | "tax";
  budget: number;
  spent: number;
  sortOrder: number;
  formula: string | null;
  formulaKey: string | null;
  formulaExpression: string | null;
  note: string | null;
  active: boolean;
};

function calculateNodes(
  nodes: NodeSnapshot[],
  parameters: Array<{ id: string; value: number }>,
) {
  const values = new Map(
    parameters.map((parameter) => [parameter.id, parameter.value]),
  );
  const calculated = nodes.map((node) => {
    const formulaExpression = formulaExpressionFor(
      node.formulaExpression,
      node.formulaKey,
    );
    return {
      ...node,
      formulaExpression,
      budget: formulaExpression
        ? evaluateFormula(formulaExpression, values)
        : node.budget,
    };
  });
  const byParent = new Map<string | null, NodeSnapshot[]>();
  calculated.forEach((node) =>
    byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]),
  );
  const rollup = (node: NodeSnapshot): { budget: number; spent: number } => {
    const children = byParent.get(node.id) ?? [];
    if (!children.length) return { budget: node.budget, spent: node.spent };
    return children.reduce(
      (total, child) => {
        const childTotal = rollup(child);
        return {
          budget: total.budget + childTotal.budget,
          spent: total.spent + childTotal.spent,
        };
      },
      { budget: 0, spent: 0 },
    );
  };
  return calculated.map((node) => {
    const total = rollup(node);
    return {
      ...node,
      budget: total.budget,
      spent: total.spent,
      remaining: total.budget - total.spent,
      variance: total.spent - total.budget,
    };
  });
}

function serializeNode(node: ReturnType<typeof calculateNodes>[number]) {
  return {
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    level: node.level,
    kind: node.kind,
    taxClass: node.taxClass,
    budget: node.budget,
    spent: node.spent,
    actual: node.spent,
    remaining: node.remaining,
    variance: node.variance,
    order: node.sortOrder,
    formula: node.formula ?? undefined,
    formulaKey: node.formulaKey ?? undefined,
    formulaExpression: node.formulaExpression ?? undefined,
    note: node.note ?? undefined,
  };
}

// 프로젝트·운영팀 지원비: 사용액·건수·잔액을 내역에서 계산한다. 잔액은 날짜순 누적.
function accountingView(
  summaries: Awaited<ReturnType<typeof prisma.nutAccountingSummary.findMany>>,
  details: Awaited<ReturnType<typeof prisma.nutAccountingDetail.findMany>>,
) {
  const budgetOf = (scope: string, owner: string, category: string) => {
    const summary = summaries.find((item) => item.scope === scope && item.name === owner);
    if (!summary) return 0;
    return toNumber(category === "support" ? summary.supportBudget : summary.technicalBudget);
  };
  const used = new Map<string, number>();
  const count = new Map<string, number>();
  const accountingDetails = details.map((detail) => {
    const key = `${detail.scope}|${detail.owner}|${detail.category}`;
    const spent = (used.get(key) ?? 0) + toNumber(detail.amount);
    used.set(key, spent);
    count.set(`${detail.scope}|${detail.owner}`, (count.get(`${detail.scope}|${detail.owner}`) ?? 0) + 1);
    return {
      id: detail.id,
      scope: detail.scope,
      owner: detail.owner,
      category: detail.category,
      date: dateOnly(detail.date),
      detail: detail.detail,
      amount: toNumber(detail.amount),
      balance: budgetOf(detail.scope, detail.owner, detail.category) - spent,
      claimant: detail.claimant ?? undefined,
    };
  });
  const accountingSummaries = summaries.map((summary) => ({
    id: summary.id,
    scope: summary.scope,
    name: summary.name,
    supportBudget: toNumber(summary.supportBudget),
    supportSpent: used.get(`${summary.scope}|${summary.name}|support`) ?? 0,
    technicalBudget: toNumber(summary.technicalBudget),
    technicalSpent: used.get(`${summary.scope}|${summary.name}|technical`) ?? 0,
    entryCount: count.get(`${summary.scope}|${summary.name}`) ?? 0,
    note: summary.note ?? undefined,
  }));
  return { accountingDetails, accountingSummaries };
}

export async function getFinanceOverview(
  periodId: string,
  viewer: FinanceViewer,
  db: DbClient = prisma,
) {
  const [
    periods,
    period,
    rawNodes,
    rawParameters,
    incomeLines,
    monthlyFlows,
    rawLedger,
    accountingDetails,
    accountingSummaries,
    claims,
    tax,
    refundAccounts,
  ] = await Promise.all([
    db.nutFinancePeriod.findMany({
      orderBy: { periodStart: "desc" },
      select: { id: true, label: true, periodStart: true, periodEnd: true },
    }),
    db.nutFinancePeriod.findUnique({ where: { id: periodId } }),
    db.nutBudgetNode.findMany({
      where: { periodId, active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.nutBudgetParameter.findMany({ where: { periodId }, orderBy: { id: "asc" } }),
    db.nutIncomeLine.findMany({
      where: { periodId },
      orderBy: { sortOrder: "asc" },
    }),
    db.nutMonthlyFlow.findMany({
      where: { periodId },
      orderBy: { month: "asc" },
    }),
    db.nutLedgerEntry.findMany({ where: { periodId } }),
    db.nutAccountingDetail.findMany({ where: { periodId }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    db.nutAccountingSummary.findMany({ where: { periodId }, orderBy: { id: "asc" } }),
    db.nutClaim.findMany({ where: { periodId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.nutTaxSummary.findUnique({ where: { periodId } }),
    viewer.canEdit ? db.nutRefundAccount.findMany({ orderBy: [{ cohort: "asc" }, { name: "asc" }] }) : Promise.resolve([]),
  ]);
  if (!period)
    throw new Error(`NUT finance period ${periodId} was not found`);

  const parameters = rawParameters.map((parameter) => ({ ...parameter }));
  // 실제 지출은 회계 내역에서 항목 이름별로 합산한다(저장된 spent는 쓰지 않는다).
  const spentByBucket = new Map<string, number>();
  rawLedger.forEach((entry) =>
    spentByBucket.set(entry.bucket, (spentByBucket.get(entry.bucket) ?? 0) + toNumber(entry.expense)),
  );
  const nodeSnapshots: NodeSnapshot[] = rawNodes.map((node) => ({
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    level: node.level,
    kind: node.kind,
    taxClass: node.taxClass,
    budget: toNumber(node.budget),
    spent: node.kind === "expense" ? (spentByBucket.get(node.name) ?? 0) : 0,
    sortOrder: node.sortOrder,
    formula: node.formula,
    formulaKey: node.formulaKey,
    formulaExpression: node.formulaExpression,
    note: node.note,
    active: node.active,
  }));
  const nodes = calculateNodes(nodeSnapshots, parameters);
  const budgetTree = nodes.map(serializeNode);
  const expenseLines = budgetTree
    .filter((node) => node.kind === "expense" && node.level === "minor")
    .map((node) => ({
      id: node.id,
      name: node.name,
      parentId: node.parentId ?? "",
      taxClass: node.taxClass,
      budget: node.budget,
      spent: node.spent,
      actual: node.actual,
      remaining: node.remaining,
      variance: node.variance,
      note: node.note,
    }));
  // 엑셀에서 가져온 행은 id 끝 번호가 시트 순서다. 새 행은 날짜·생성 순.
  let running = toNumber(period.openingCash);
  const claimByLedger = new Map(claims.filter((c) => c.ledgerEntryId).map((c) => [c.ledgerEntryId!, c.id]));
  const ledger = rawLedger
    .sort(
      (a, b) =>
        a.transactionDate.getTime() - b.transactionDate.getTime() ||
        ledgerOrder(a.id) - ledgerOrder(b.id),
    )
    .map((entry) => ({
      id: entry.id,
      date: dateOnly(entry.transactionDate),
      month: entry.month,
      type: entry.type,
      bucket: entry.bucket,
      detail: entry.detail,
      income: toNumber(entry.income),
      expense: toNumber(entry.expense),
      balance: (running += toNumber(entry.income) - toNumber(entry.expense)),
      claimId: claimByLedger.get(entry.id),
      amount: toNumber(entry.amount),
      claimant: entry.claimant ?? undefined,
      note: entry.note ?? undefined,
      source: entry.source,
      taxClass: entry.taxClass,
    }));
  const income = ledger.reduce((sum, entry) => sum + entry.income, 0);
  const expense = ledger.reduce((sum, entry) => sum + entry.expense, 0);
  const currentCash = toNumber(period.openingCash) + income - expense;
  const incomeBudget = toNumber(period.incomeBudget);
  const expenseBudget = toNumber(period.expenseBudget);
  const plan = {
    income: incomeBudget,
    expense: expenseBudget,
    net: incomeBudget - expenseBudget,
  };
  const actual = { income, expense, net: income - expense };
  const variance = {
    income: income - incomeBudget,
    expense: expense - expenseBudget,
    net: actual.net - plan.net,
  };
  const remaining = {
    income: incomeBudget - income,
    expense: expenseBudget - expense,
    net: plan.net - actual.net,
  };
  return {
    periods: periods.map((item) => ({
      id: item.id,
      label: item.label,
      start: dateOnly(item.periodStart),
      end: dateOnly(item.periodEnd),
    })),
    viewer: { canEdit: viewer.canEdit },
    period: {
      id: period.id,
      label: period.label,
      start: dateOnly(period.periodStart),
      end: dateOnly(period.periodEnd),
      asOf: dateOnly(period.asOf),
    },
    fiscalYear: {
      label: period.fiscalYearLabel,
      start: dateOnly(period.fiscalYearStart),
      end: dateOnly(period.fiscalYearEnd),
    },
    openingCash: toNumber(period.openingCash),
    currentCash,
    incomeBudget,
    incomeActual: income,
    expenseBudget,
    expenseActual: expense,
    plan,
    actual,
    variance,
    remaining,
    budgetTree,
    parameters,
    budgetLines: expenseLines,
    incomeLines: incomeLines.map((line) => {
      const budget = toNumber(line.budget);
      const lineActual = toNumber(line.actual);
      return {
        id: line.id,
        name: line.name,
        budget,
        actual: lineActual,
        remaining: budget - lineActual,
        variance: lineActual - budget,
        sortOrder: line.sortOrder,
        note: line.note ?? undefined,
        taxClass: line.taxClass,
      };
    }),
    monthlyFlows: monthlyFlows.map((flow) => {
      const budget = toNumber(flow.budget);
      const flowActual = toNumber(flow.actual);
      return {
        month: flow.month,
        label: flow.label,
        budget,
        actual: flowActual,
        remaining: budget - flowActual,
        variance: flowActual - budget,
        income: toNumber(flow.income),
      };
    }),
    ledger,
    ...accountingView(accountingSummaries, accountingDetails),
    refundAccounts: refundAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      cohort: account.cohort ?? undefined,
      email: account.email ?? undefined,
      bankAccount: account.bankAccount,
    })),
    claims: claims.map((claim) => {
      const canSeeAccount = viewer.canEdit || claim.memberId === viewer.memberId;
      // 청구서에 계좌가 없으면 환급 계좌 명단에서 같은 이름을 찾아 보여준다(처리 권한자에게만).
      const fallback = viewer.canEdit && !claim.bankAccount
        ? refundAccounts.find((account) => normalizeName(account.name) === normalizeName(claim.claimant))?.bankAccount
        : undefined;
      return {
        id: claim.id,
        date: dateOnly(claim.date),
        detail: claim.detail,
        amount: toNumber(claim.amount),
        claimant: claim.claimant,
        bucket: claim.bucket,
        status: claim.status,
        source: claim.source,
        prepaid: claim.prepaid,
        mine: claim.memberId === viewer.memberId,
        bankAccount: canSeeAccount ? (claim.bankAccount ?? fallback ?? undefined) : undefined,
        note: claim.note ?? undefined,
        rejectReason: claim.rejectReason ?? undefined,
        reviewedAt: claim.reviewedAt?.toISOString(),
        paidAt: claim.paidAt?.toISOString(),
        ledgerEntryId: claim.ledgerEntryId ?? undefined,
      };
    }),
    tax: tax
      ? {
          taxableGains: toNumber(tax.taxableGains),
          nonTaxableGains: toNumber(tax.nonTaxableGains),
          deductibleExpenses: toNumber(tax.deductibleExpenses),
          nonDeductibleExpenses: toNumber(tax.nonDeductibleExpenses),
          freelanceContractCost: toNumber(tax.freelanceContractCost),
          corporateTax: toNumber(tax.corporateTax),
          withholdingTax: toNumber(tax.withholdingTax),
          vat: toNumber(tax.vat),
          totalTax: toNumber(tax.totalTax),
        }
      : {
          taxableGains: income,
          nonTaxableGains: 0,
          deductibleExpenses: 0,
          nonDeductibleExpenses: 0,
          freelanceContractCost: 0,
          corporateTax: 0,
          withholdingTax: 0,
          vat: 0,
          totalTax: 0,
        },
  };
}

type TaxClass =
  | "non_taxable_gain"
  | "taxable_gain"
  | "tax_deductible_expense"
  | "non_tax_deductible_expense"
  | "tax";

// 예산 산출식(파라미터)으로 정해지는 예산액을 다시 계산해 저장하고, 반기 지출 예산 합계를 갱신한다.
// 실제 지출(spent)은 저장하지 않고 조회 때 회계 내역에서 계산한다(getFinanceOverview).
async function syncBudgetRollups(tx: Prisma.TransactionClient, periodId: string) {
  const [rawNodes, parameters] = await Promise.all([
    tx.nutBudgetNode.findMany({ where: { periodId, active: true }, orderBy: { sortOrder: "asc" } }),
    tx.nutBudgetParameter.findMany({ where: { periodId } }),
  ]);
  const calculated = calculateNodes(rawNodes.map(toSnapshot), parameters);
  await Promise.all(
    calculated.map((node) =>
      tx.nutBudgetNode.update({ where: { id: node.id }, data: { budget: BigInt(node.budget) } }),
    ),
  );
  const expenseBudget = calculated
    .filter((node) => node.parentId === null && node.kind === "expense")
    .reduce((sum, node) => sum + node.budget, 0);
  await tx.nutFinancePeriod.update({ where: { id: periodId }, data: { expenseBudget: BigInt(expenseBudget) } });
}

function toSnapshot(node: Awaited<ReturnType<typeof prisma.nutBudgetNode.findMany>>[number]): NodeSnapshot {
  return {
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    level: node.level,
    kind: node.kind,
    taxClass: node.taxClass,
    budget: toNumber(node.budget),
    spent: toNumber(node.spent),
    sortOrder: node.sortOrder,
    formula: node.formula,
    formulaKey: node.formulaKey,
    formulaExpression: node.formulaExpression,
    note: node.note,
    active: node.active,
  };
}

export class ParameterInUseError extends Error {}

// ---------- 예산 변수 ----------

export async function updateBudgetParameter(
  periodId: string,
  id: string,
  input: { value?: number; label?: string; unit?: string; description?: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.nutBudgetParameter.update({ where: { periodId_id: { periodId, id } }, data: input });
    await syncBudgetRollups(tx, periodId);
    if (id === "freelance-contract-cost" && input.value !== undefined) {
      const tax = await tx.nutTaxSummary.findUnique({ where: { periodId } });
      if (tax) {
        const withholdingTax = Math.round(input.value * 0.033);
        await tx.nutTaxSummary.update({
          where: { id: tax.id },
          data: {
            freelanceContractCost: BigInt(input.value),
            withholdingTax: BigInt(withholdingTax),
            totalTax: tax.corporateTax + tax.vat + BigInt(withholdingTax),
          },
        });
      }
    }
    return periodId;
  });
}

export async function createBudgetParameter(
  periodId: string,
  input: { id: string; label: string; value: number; unit: string; description: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.nutBudgetParameter.create({ data: { periodId, ...input } });
    await syncBudgetRollups(tx, periodId);
    return periodId;
  });
}

export async function deleteBudgetParameter(periodId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const parameter = await tx.nutBudgetParameter.findUnique({ where: { periodId_id: { periodId, id } } });
    if (!parameter) throw new Error(`환경설정 변수 '${id}'를 찾을 수 없습니다.`);
    const nodes = await tx.nutBudgetNode.findMany({ where: { periodId, active: true } });
    const used = nodes.some((node) =>
      formulaUsesParameter(node.formulaExpression ?? formulaExpressionFor(null, node.formulaKey), id),
    );
    if (used)
      throw new ParameterInUseError(`'${parameter.label}' 변수는 산출식에서 사용 중이라 삭제할 수 없습니다.`);
    await tx.nutBudgetParameter.delete({ where: { periodId_id: { periodId, id } } });
    await syncBudgetRollups(tx, periodId);
    return periodId;
  });
}

// ---------- 예산 항목 ----------

export async function createBudgetNode(
  periodId: string,
  input: {
    name: string;
    parentId: string | null;
    level: "major" | "middle" | "minor";
    kind: "income" | "expense" | "tax";
    taxClass: TaxClass;
    budget: number;
    formula?: string | null;
    formulaKey?: string | null;
    formulaExpression?: string | null;
    note?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.nutBudgetNode.findFirst({
      where: { periodId, active: true, parentId: input.parentId, level: input.level },
      orderBy: { sortOrder: "desc" },
    });
    await tx.nutBudgetNode.create({
      data: {
        id: `budget-node-${crypto.randomUUID()}`,
        periodId,
        name: input.name,
        parentId: input.parentId,
        level: input.level,
        kind: input.kind,
        taxClass: input.taxClass,
        budget: BigInt(input.budget),
        spent: 0n,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        formula: input.formula ?? null,
        formulaKey: input.formulaKey ?? null,
        formulaExpression: input.formulaExpression ?? null,
        note: input.note ?? null,
        active: true,
      },
    });
    await syncBudgetRollups(tx, periodId);
    return periodId;
  });
}

export async function updateBudgetNode(
  id: string,
  input: Partial<{
    name: string;
    parentId: string | null;
    level: "major" | "middle" | "minor";
    kind: "income" | "expense" | "tax";
    taxClass: TaxClass;
    budget: number;
    formula: string | null;
    formulaKey: string | null;
    formulaExpression: string | null;
    note: string | null;
    sortOrder: number;
    active: boolean;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.nutBudgetNode.findUniqueOrThrow({ where: { id } });
    await tx.nutBudgetNode.update({
      where: { id },
      data: { ...input, ...(input.budget === undefined ? {} : { budget: BigInt(input.budget) }) },
    });
    // 이름을 바꾸면 그 항목으로 기록된 회계 내역도 같이 바꿔야 실제 지출 집계가 끊기지 않는다.
    if (input.name && input.name !== before.name)
      await tx.nutLedgerEntry.updateMany({
        where: { periodId: before.periodId, bucket: before.name },
        data: { bucket: input.name },
      });
    await syncBudgetRollups(tx, before.periodId);
    return before.periodId;
  });
}

export async function reorderBudgetNodes(ids: string[]) {
  return prisma.$transaction(async (tx) => {
    const nodes = await tx.nutBudgetNode.findMany({ where: { id: { in: ids }, active: true } });
    if (nodes.length !== ids.length) throw new Error("정렬할 항목을 찾을 수 없습니다.");
    const first = nodes[0]!;
    if (nodes.some((node) => node.parentId !== first.parentId || node.level !== first.level || node.periodId !== first.periodId))
      throw new Error("같은 계층의 항목만 정렬할 수 있습니다.");
    await Promise.all(ids.map((id, index) => tx.nutBudgetNode.update({ where: { id }, data: { sortOrder: index + 1 } })));
    return first.periodId;
  });
}

// ---------- 회계 내역 ----------

type LedgerInput = {
  date: string;
  type: "income" | "expense";
  bucket: string;
  detail: string;
  amount: number;
  claimant?: string | null;
  note?: string | null;
  source?: string;
  taxClass: TaxClass;
};

function ledgerData(input: LedgerInput) {
  const amount = Math.max(0, Math.round(input.amount));
  return {
    transactionDate: new Date(`${input.date}T00:00:00Z`),
    month: Number(input.date.slice(5, 7)),
    type: input.type,
    bucket: input.bucket,
    detail: input.detail,
    income: input.type === "income" ? BigInt(amount) : 0n,
    expense: input.type === "expense" ? BigInt(amount) : 0n,
    amount: BigInt(amount),
    claimant: input.claimant ?? null,
    note: input.note ?? null,
    taxClass: input.taxClass,
  };
}

// 잔액·실제 지출·수입 합계는 모두 조회 때 회계 내역에서 계산하므로 행만 쓰면 된다.
async function insertLedgerEntry(tx: Prisma.TransactionClient, periodId: string, input: LedgerInput) {
  return tx.nutLedgerEntry.create({
    data: {
      id: `ledger-${crypto.randomUUID()}`,
      periodId,
      ...ledgerData(input),
      balance: 0n,
      source: input.source ?? "Manual",
    },
  });
}

export async function createLedgerEntry(periodId: string, input: LedgerInput) {
  await prisma.$transaction((tx) => insertLedgerEntry(tx, periodId, input));
  return periodId;
}

export async function updateLedgerEntry(id: string, input: Partial<LedgerInput>) {
  const before = await prisma.nutLedgerEntry.findUniqueOrThrow({ where: { id } });
  const merged: LedgerInput = {
    date: dateOnly(before.transactionDate),
    type: before.type,
    bucket: before.bucket,
    detail: before.detail,
    amount: toNumber(before.amount),
    claimant: before.claimant,
    note: before.note,
    taxClass: before.taxClass,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
  };
  await prisma.nutLedgerEntry.update({ where: { id }, data: ledgerData(merged) });
  return before.periodId;
}

// 청구서 지급으로 생긴 내역을 지우면 청구서는 '승인'으로 되돌린다(지급 취소).
export async function deleteLedgerEntry(id: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.nutLedgerEntry.findUniqueOrThrow({ where: { id } });
    await tx.nutClaim.updateMany({
      where: { ledgerEntryId: id },
      data: { ledgerEntryId: null, status: "approved", paidAt: null },
    });
    await tx.nutLedgerEntry.delete({ where: { id } });
    return entry.periodId;
  });
}

// ---------- 청구서 ----------

export class ClaimStateError extends Error {}

// 청구서는 Slack 워크플로 단계(app/api/slack/events)에서만 만든다. id를 주면 그 id로 한 번만
// 만든다(Slack은 응답이 늦으면 같은 이벤트를 다시 보낸다).
export async function createClaim(
  periodId: string,
  input: {
    id?: string;
    memberId: string | null;
    claimant: string;
    date: string;
    detail: string;
    amount: number;
    bucket: string;
    bankAccount?: string | null;
    prepaid: boolean;
    note?: string | null;
    source: "NUT" | "Slack";
  },
) {
  const id = input.id ?? `claim-${crypto.randomUUID()}`;
  await prisma.nutClaim.upsert({
    where: { id },
    update: {},
    create: {
      id,
      periodId,
      memberId: input.memberId,
      claimant: input.claimant,
      date: new Date(`${input.date}T00:00:00Z`),
      detail: input.detail,
      amount: BigInt(Math.max(0, Math.round(input.amount))),
      bucket: input.bucket,
      bankAccount: input.bankAccount || null,
      prepaid: input.prepaid,
      note: input.note || null,
      status: "review",
      source: input.source,
    },
  });
  return id;
}

// 처리 흐름: 검토 중 → 승인 → 지급 완료, 검토 중·승인 → 반려, 반려 → 검토 중(다시 열기).
// 지급하면 같은 트랜잭션에서 회계에 지출로 기록한다.
export async function actOnClaim(
  id: string,
  action:
    | { type: "approve"; bucket?: string }
    | { type: "reject"; reason: string }
    | { type: "reopen" }
    | { type: "pay"; date: string; bucket?: string },
  reviewerMemberId: string,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.nutClaim.findUniqueOrThrow({ where: { id } });
    // 승인·지급하면서 예산 항목을 정할 수 있다(Slack 청구서는 '미분류'로 들어온다).
    const bucket = "bucket" in action && action.bucket ? action.bucket : found.bucket;
    const claim = { ...found, bucket };
    const reviewed = { reviewedByMemberId: reviewerMemberId, reviewedAt: new Date() };
    if (action.type === "approve") {
      if (claim.status !== "review") throw new ClaimStateError("검토 중인 청구서만 승인할 수 있습니다.");
      await tx.nutClaim.update({ where: { id }, data: { status: "approved", bucket, rejectReason: null, ...reviewed } });
    } else if (action.type === "reject") {
      if (claim.status === "paid") throw new ClaimStateError("이미 지급한 청구서는 반려할 수 없습니다. 먼저 지급을 취소하세요.");
      await tx.nutClaim.update({ where: { id }, data: { status: "rejected", rejectReason: action.reason, ...reviewed } });
    } else if (action.type === "reopen") {
      if (claim.status !== "rejected") throw new ClaimStateError("반려된 청구서만 다시 열 수 있습니다.");
      await tx.nutClaim.update({ where: { id }, data: { status: "review", rejectReason: null } });
    } else {
      if (claim.status !== "review" && claim.status !== "approved")
        throw new ClaimStateError("검토 중이거나 승인된 청구서만 지급할 수 있습니다.");
      if (bucket === "미분류") throw new ClaimStateError("지급하기 전에 예산 항목을 정하세요.");
      const node = await tx.nutBudgetNode.findFirst({
        where: { periodId: claim.periodId, active: true, kind: "expense", name: claim.bucket },
      });
      const entry = await insertLedgerEntry(tx, claim.periodId, {
        date: action.date,
        type: "expense",
        bucket: claim.bucket,
        detail: claim.detail,
        amount: toNumber(claim.amount),
        claimant: claim.claimant,
        note: null,
        source: "청구서",
        taxClass: node?.taxClass ?? "tax_deductible_expense",
      });
      await tx.nutClaim.update({
        where: { id },
        data: { status: "paid", bucket, paidAt: new Date(), ledgerEntryId: entry.id, ...reviewed },
      });
    }
    return claim.periodId;
  });
}

// ---------- 프로젝트·운영팀 지원비 ----------
// 사용액·잔액·건수는 조회 때 내역에서 계산하므로 여기선 행만 쓴다.

export async function saveAccountingSummary(
  periodId: string,
  input: {
    id?: string;
    scope: "project" | "team";
    name: string;
    supportBudget: number;
    technicalBudget: number;
    note?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.nutAccountingSummary.findUniqueOrThrow({ where: { id: input.id } });
      await tx.nutAccountingSummary.update({
        where: { id: input.id },
        data: {
          name: input.name,
          supportBudget: BigInt(input.supportBudget),
          technicalBudget: BigInt(input.technicalBudget),
          note: input.note ?? null,
        },
      });
      if (before.name !== input.name)
        await tx.nutAccountingDetail.updateMany({
          where: { periodId: before.periodId, scope: before.scope, owner: before.name },
          data: { owner: input.name },
        });
      return before.periodId;
    }
    await tx.nutAccountingSummary.create({
      data: {
        id: `accounting-${crypto.randomUUID()}`,
        periodId,
        scope: input.scope,
        name: input.name,
        supportBudget: BigInt(input.supportBudget),
        supportSpent: 0n,
        technicalBudget: BigInt(input.technicalBudget),
        technicalSpent: 0n,
        entryCount: 0,
        note: input.note ?? null,
      },
    });
    return periodId;
  });
}

export async function deleteAccountingSummary(id: string) {
  const summary = await prisma.nutAccountingSummary.findUniqueOrThrow({ where: { id } });
  const used = await prisma.nutAccountingDetail.count({
    where: { periodId: summary.periodId, scope: summary.scope, owner: summary.name },
  });
  if (used) throw new ClaimStateError("사용 내역이 있는 팀은 삭제할 수 없습니다. 내역을 먼저 지우세요.");
  await prisma.nutAccountingSummary.delete({ where: { id } });
  return summary.periodId;
}

type AccountingDetailInput = {
  scope: "project" | "team";
  owner: string;
  category: "support" | "technical";
  date: string;
  detail: string;
  amount: number;
  claimant?: string | null;
};

export async function createAccountingDetail(periodId: string, input: AccountingDetailInput) {
  await prisma.nutAccountingDetail.create({
    data: {
      id: `accounting-detail-${crypto.randomUUID()}`,
      periodId,
      scope: input.scope,
      owner: input.owner,
      category: input.category,
      date: new Date(`${input.date}T00:00:00Z`),
      detail: input.detail,
      amount: BigInt(Math.max(0, Math.round(input.amount))),
      balance: 0n,
      claimant: input.claimant || null,
    },
  });
  return periodId;
}

export async function updateAccountingDetail(id: string, input: Partial<AccountingDetailInput>) {
  const detail = await prisma.nutAccountingDetail.update({
    where: { id },
    data: {
      ...(input.category ? { category: input.category } : {}),
      ...(input.date ? { date: new Date(`${input.date}T00:00:00Z`) } : {}),
      ...(input.detail ? { detail: input.detail } : {}),
      ...(input.amount !== undefined ? { amount: BigInt(Math.max(0, Math.round(input.amount))) } : {}),
      ...(input.claimant !== undefined ? { claimant: input.claimant || null } : {}),
    },
  });
  return detail.periodId;
}

export async function deleteAccountingDetail(id: string) {
  const detail = await prisma.nutAccountingDetail.delete({ where: { id } });
  return detail.periodId;
}

// ---------- 반기 ----------

// 새 반기는 이전 반기의 예산 구조·변수·운영팀 목록을 복사해서 시작한다(실제 지출은 0).
// 기초 잔액은 이전 반기의 현재 잔액을 넘겨받는다.
export async function createPeriod(input: {
  id: string;
  label: string;
  start: string;
  end: string;
  copyFromId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.nutFinancePeriod.findUniqueOrThrow({ where: { id: input.copyFromId } });
    const net = await tx.nutLedgerEntry.aggregate({
      where: { periodId: source.id },
      _sum: { income: true, expense: true },
    });
    const openingCash = source.openingCash + (net._sum.income ?? 0n) - (net._sum.expense ?? 0n);
    const start = new Date(`${input.start}T00:00:00Z`);
    await tx.nutFinancePeriod.create({
      data: {
        id: input.id,
        label: input.label,
        periodStart: start,
        periodEnd: new Date(`${input.end}T00:00:00Z`),
        asOf: start,
        fiscalYearLabel: source.fiscalYearLabel,
        fiscalYearStart: source.fiscalYearStart,
        fiscalYearEnd: source.fiscalYearEnd,
        openingCash,
        currentCash: openingCash,
        incomeBudget: source.incomeBudget,
      },
    });
    const [parameters, nodes, teams, incomeLines] = await Promise.all([
      tx.nutBudgetParameter.findMany({ where: { periodId: source.id } }),
      tx.nutBudgetNode.findMany({ where: { periodId: source.id, active: true } }),
      tx.nutAccountingSummary.findMany({ where: { periodId: source.id, scope: "team" } }),
      tx.nutIncomeLine.findMany({ where: { periodId: source.id } }),
    ]);
    await tx.nutBudgetParameter.createMany({ data: parameters.map((parameter) => ({ ...parameter, periodId: input.id })) });
    const newIds = new Map(nodes.map((node) => [node.id, `budget-node-${crypto.randomUUID()}`]));
    await tx.nutBudgetNode.createMany({
      data: nodes.map((node) => ({
        ...node,
        id: newIds.get(node.id)!,
        parentId: node.parentId ? (newIds.get(node.parentId) ?? null) : null,
        periodId: input.id,
        spent: 0n,
      })),
    });
    await tx.nutAccountingSummary.createMany({
      data: teams.map((team) => ({
        ...team,
        id: `accounting-${crypto.randomUUID()}`,
        periodId: input.id,
        supportSpent: 0n,
        technicalSpent: 0n,
        entryCount: 0,
      })),
    });
    await tx.nutIncomeLine.createMany({
      data: incomeLines.map((line) => ({ ...line, id: `income-${crypto.randomUUID()}`, periodId: input.id, actual: 0n })),
    });
    await syncBudgetRollups(tx, input.id);
    return input.id;
  });
}

// ---------- 환급 계좌 ----------

// Slack 청구인의 이메일로 먼저, 없으면 이름(공백 무시)으로 찾는다. 이름이 같은 사람이 둘이면 찾지 않는다.
// 찾은 사람의 이름이 청구서의 청구인 이름이 된다(예전 시트의 '선결제 후지급' 칸 = 정규화된 청구인 이름).
export async function findRefundAccount(email: string | null | undefined, name: string | null | undefined) {
  if (email) {
    const byEmail = await prisma.nutRefundAccount.findUnique({ where: { email: email.toLowerCase() } });
    if (byEmail) return byEmail;
  }
  if (!name) return null;
  const target = normalizeName(name);
  const byName = (await prisma.nutRefundAccount.findMany()).filter((account) => normalizeName(account.name) === target);
  return byName.length === 1 ? byName[0]! : null;
}

export async function saveRefundAccount(input: {
  id?: string;
  name: string;
  cohort?: string | null;
  email?: string | null;
  bankAccount: string;
}) {
  const data = {
    name: input.name,
    cohort: input.cohort || null,
    email: input.email ? input.email.toLowerCase() : null,
    bankAccount: input.bankAccount,
  };
  if (input.id) await prisma.nutRefundAccount.update({ where: { id: input.id }, data });
  else await prisma.nutRefundAccount.create({ data: { id: `refund-${crypto.randomUUID()}`, ...data } });
}

export async function deleteRefundAccount(id: string) {
  await prisma.nutRefundAccount.delete({ where: { id } });
}
