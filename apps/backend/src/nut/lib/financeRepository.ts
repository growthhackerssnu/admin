import { Prisma, type PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export const ACTIVE_PERIOD_ID = "2026-2h";

type DbClient = PrismaClient | Prisma.TransactionClient;

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

export async function getFinanceOverview(db: DbClient = prisma) {
  const [
    period,
    buckets,
    rawNodes,
    rawParameters,
    incomeLines,
    monthlyFlows,
    rawLedger,
    accountingDetails,
    accountingSummaries,
    claims,
    tax,
  ] = await Promise.all([
    db.nutFinancePeriod.findUnique({ where: { id: ACTIVE_PERIOD_ID } }),
    db.nutFinanceBucket.findMany({ orderBy: { id: "asc" } }),
    db.nutBudgetNode.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.nutBudgetParameter.findMany({ orderBy: { id: "asc" } }),
    db.nutIncomeLine.findMany({
      where: { periodId: ACTIVE_PERIOD_ID },
      orderBy: { sortOrder: "asc" },
    }),
    db.nutMonthlyFlow.findMany({
      where: { periodId: ACTIVE_PERIOD_ID },
      orderBy: { month: "asc" },
    }),
    db.nutLedgerEntry.findMany(),
    db.nutAccountingDetail.findMany({ orderBy: { date: "asc" } }),
    db.nutAccountingSummary.findMany({ orderBy: { id: "asc" } }),
    db.nutClaim.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }] }),
    db.nutTaxSummary.findUnique({ where: { periodId: ACTIVE_PERIOD_ID } }),
  ]);
  if (!period)
    throw new Error(`NUT finance period ${ACTIVE_PERIOD_ID} was not found`);

  const parameters = rawParameters.map((parameter) => ({ ...parameter }));
  const nodeSnapshots: NodeSnapshot[] = rawNodes.map((node) => ({
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
  const ledger = rawLedger
    .sort((a, b) => ledgerOrder(a.id) - ledgerOrder(b.id))
    .map((entry) => ({
      id: entry.id,
      date: dateOnly(entry.transactionDate),
      month: entry.month,
      type: entry.type,
      bucket: entry.bucket,
      detail: entry.detail,
      income: toNumber(entry.income),
      expense: toNumber(entry.expense),
      balance: toNumber(entry.balance),
      amount: toNumber(entry.amount),
      claimant: entry.claimant ?? undefined,
      note: entry.note ?? undefined,
      source: entry.source,
      taxClass: entry.taxClass,
    }));
  const income = toNumber(period.incomeActual);
  const expense = toNumber(period.expenseActual);
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
  const ledgerIncome = ledger.reduce((sum, entry) => sum + entry.income, 0);
  const ledgerExpense = ledger.reduce((sum, entry) => sum + entry.expense, 0);
  const cashDifference =
    toNumber(period.openingCash) +
    ledgerIncome -
    ledgerExpense -
    toNumber(period.currentCash);
  const ledgerDifference = ledgerIncome - income + (ledgerExpense - expense);

  return {
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
    currentCash: toNumber(period.currentCash),
    incomeBudget,
    incomeActual: income,
    expenseBudget,
    expenseActual: expense,
    plan,
    actual,
    variance,
    remaining,
    buckets: buckets.map((bucket) => {
      const budget = toNumber(bucket.budget);
      const spent = toNumber(bucket.spent);
      return {
        id: bucket.id,
        name: bucket.name,
        parentId: bucket.parentId,
        kind: bucket.kind,
        taxClass: bucket.taxClass,
        budget,
        spent,
        actual: spent,
        remaining: budget - spent,
        variance: spent - budget,
        description: bucket.description ?? undefined,
      };
    }),
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
    accountingDetails: accountingDetails.map((detail) => ({
      id: detail.id,
      scope: detail.scope,
      owner: detail.owner,
      category: detail.category,
      date: dateOnly(detail.date),
      detail: detail.detail,
      amount: toNumber(detail.amount),
      balance: toNumber(detail.balance),
      claimant: detail.claimant ?? undefined,
    })),
    accountingSummaries: accountingSummaries.map((summary) => ({
      id: summary.id,
      scope: summary.scope,
      name: summary.name,
      supportBudget: toNumber(summary.supportBudget),
      supportSpent: toNumber(summary.supportSpent),
      technicalBudget: toNumber(summary.technicalBudget),
      technicalSpent: toNumber(summary.technicalSpent),
      entryCount: summary.entryCount,
      note: summary.note ?? undefined,
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      date: dateOnly(claim.date),
      detail: claim.detail,
      amount: toNumber(claim.amount),
      claimant: claim.claimant,
      bucket: claim.bucket,
      status: claim.status,
      source: claim.source,
      prepaid: claim.prepaid,
    })),
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
    reconciliation: {
      status:
        cashDifference === 0 && ledgerDifference === 0 ? "matched" : "review",
      difference: cashDifference + ledgerDifference,
      cashDifference,
      ledgerDifference,
      note:
        cashDifference === 0 && ledgerDifference === 0
          ? "Excel 회계 시트와 결산안 현금 잔액이 일치합니다."
          : "Excel 회계 시트와 결산안 합계를 다시 확인해야 합니다.",
    },
  };
}

async function syncBudgetRollups(
  tx: Prisma.TransactionClient,
  parameters?: Array<{ id: string; value: number }>,
) {
  const [rawNodes, rawParameters] = await Promise.all([
    tx.nutBudgetNode.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    parameters
      ? Promise.resolve(parameters)
      : tx.nutBudgetParameter.findMany({ orderBy: { id: "asc" } }),
  ]);
  const snapshots: NodeSnapshot[] = rawNodes.map((node) => ({
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
  }));
  const calculated = calculateNodes(
    snapshots,
    rawParameters.map((parameter) => ({
      id: parameter.id,
      value: parameter.value,
    })),
  );
  await Promise.all(
    calculated.map((node) =>
      tx.nutBudgetNode.update({
        where: { id: node.id },
        data: { budget: BigInt(node.budget), spent: BigInt(node.spent) },
      }),
    ),
  );
  const expenseMajor = calculated.filter(
    (node) => node.parentId === null && node.kind === "expense",
  );
  const buckets = await tx.nutFinanceBucket.findMany({
    where: { kind: "expense" },
  });
  await Promise.all(
    buckets.map((bucket) => {
      const matching = expenseMajor.find((node) => node.name === bucket.name);
      return matching
        ? tx.nutFinanceBucket.update({
            where: { id: bucket.id },
            data: {
              budget: BigInt(matching.budget),
              spent: BigInt(matching.spent),
            },
          })
        : Promise.resolve();
    }),
  );
  const periodBudget = expenseMajor.reduce((sum, node) => sum + node.budget, 0);
  await tx.nutFinancePeriod.update({
    where: { id: ACTIVE_PERIOD_ID },
    data: { expenseBudget: BigInt(periodBudget) },
  });
}

async function addBudgetSpending(
  tx: Prisma.TransactionClient,
  bucketName: string,
  amount: number,
) {
  const rawNodes = await tx.nutBudgetNode.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const target = rawNodes.find(
    (node) => node.kind === "expense" && node.name === bucketName,
  );
  if (!target) return;
  const spentById = new Map(
    rawNodes.map((node) => [node.id, toNumber(node.spent)]),
  );
  spentById.set(target.id, (spentById.get(target.id) ?? 0) + amount);
  const children = new Map<string, typeof rawNodes>();
  rawNodes.forEach((node) => {
    if (node.parentId)
      children.set(node.parentId, [
        ...(children.get(node.parentId) ?? []),
        node,
      ]);
  });
  const rollup = (id: string): number => {
    const childNodes = children.get(id) ?? [];
    if (!childNodes.length) return spentById.get(id) ?? 0;
    const total = childNodes.reduce((sum, child) => sum + rollup(child.id), 0);
    spentById.set(id, total);
    return total;
  };
  rawNodes
    .filter((node) => node.parentId === null)
    .forEach((node) => rollup(node.id));
  await Promise.all(
    [...spentById].map(([id, spent]) =>
      tx.nutBudgetNode.update({
        where: { id },
        data: { spent: BigInt(spent) },
      }),
    ),
  );
  const expenseMajor = rawNodes.filter(
    (node) => node.parentId === null && node.kind === "expense",
  );
  const buckets = await tx.nutFinanceBucket.findMany({
    where: { kind: "expense" },
  });
  await Promise.all(
    buckets.map((bucket) => {
      const matching = expenseMajor.find((node) => node.name === bucket.name);
      return matching
        ? tx.nutFinanceBucket.update({
            where: { id: bucket.id },
            data: { spent: BigInt(spentById.get(matching.id) ?? 0) },
          })
        : Promise.resolve();
    }),
  );
}

export class ParameterInUseError extends Error {}

export async function updateBudgetParameter(
  id: string,
  input: {
    value?: number;
    label?: string;
    unit?: string;
    description?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const parameter = await tx.nutBudgetParameter.update({
      where: { id },
      data: input,
    });
    const parameters = await tx.nutBudgetParameter.findMany({
      orderBy: { id: "asc" },
    });
    await syncBudgetRollups(tx, parameters);
    if (id === "freelance-contract-cost") {
      const tax = await tx.nutTaxSummary.findUnique({
        where: { periodId: ACTIVE_PERIOD_ID },
      });
      if (tax && input.value !== undefined) {
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
    return { parameter, overview: await getFinanceOverview(tx) };
  });
}

export async function createBudgetParameter(input: {
  id: string;
  label: string;
  value: number;
  unit: string;
  description: string;
}) {
  return prisma.$transaction(async (tx) => {
    const parameter = await tx.nutBudgetParameter.create({ data: input });
    const parameters = await tx.nutBudgetParameter.findMany({
      orderBy: { id: "asc" },
    });
    await syncBudgetRollups(tx, parameters);
    return { parameter, overview: await getFinanceOverview(tx) };
  });
}

export async function deleteBudgetParameter(id: string) {
  return prisma.$transaction(async (tx) => {
    const parameter = await tx.nutBudgetParameter.findUnique({ where: { id } });
    if (!parameter)
      throw new Error(`환경설정 변수 '${id}'를 찾을 수 없습니다.`);
    const nodes = await tx.nutBudgetNode.findMany({ where: { active: true } });
    const used = nodes.some((node) =>
      formulaUsesParameter(
        node.formulaExpression ?? formulaExpressionFor(null, node.formulaKey),
        id,
      ),
    );
    if (used)
      throw new ParameterInUseError(
        `'${parameter.label}' 변수는 산출식에서 사용 중이라 삭제할 수 없습니다.`,
      );
    await tx.nutBudgetParameter.delete({ where: { id } });
    const parameters = await tx.nutBudgetParameter.findMany({
      orderBy: { id: "asc" },
    });
    await syncBudgetRollups(tx, parameters);
    return { overview: await getFinanceOverview(tx) };
  });
}

export async function createBudgetNode(input: {
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
  formula?: string | null;
  formulaKey?: string | null;
  formulaExpression?: string | null;
  note?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.nutBudgetNode.findFirst({
      where: { active: true, parentId: input.parentId, level: input.level },
      orderBy: { sortOrder: "desc" },
    });
    const node = await tx.nutBudgetNode.create({
      data: {
        id: `budget-node-${crypto.randomUUID()}`,
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
    await syncBudgetRollups(tx);
    return { node, overview: await getFinanceOverview(tx) };
  });
}

export async function updateBudgetNode(
  id: string,
  input: Partial<{
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
    formula: string | null;
    formulaKey: string | null;
    formulaExpression: string | null;
    note: string | null;
    sortOrder: number;
    active: boolean;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    const node = await tx.nutBudgetNode.update({
      where: { id },
      data: {
        ...input,
        ...(input.budget === undefined ? {} : { budget: BigInt(input.budget) }),
      },
    });
    await syncBudgetRollups(tx);
    return { node, overview: await getFinanceOverview(tx) };
  });
}

export async function reorderBudgetNodes(ids: string[]) {
  return prisma.$transaction(async (tx) => {
    const nodes = await tx.nutBudgetNode.findMany({
      where: { id: { in: ids }, active: true },
    });
    if (nodes.length !== ids.length)
      throw new Error("정렬할 bucket을 찾을 수 없습니다.");
    const parentId = nodes[0]?.parentId ?? null;
    const level = nodes[0]?.level;
    if (
      nodes.some((node) => node.parentId !== parentId || node.level !== level)
    )
      throw new Error("같은 계층의 bucket만 정렬할 수 있습니다.");
    await Promise.all(
      ids.map((id, index) =>
        tx.nutBudgetNode.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
    return { overview: await getFinanceOverview(tx) };
  });
}

export async function createLedgerEntry(input: {
  date: string;
  type: "income" | "expense";
  bucket: string;
  detail: string;
  amount: number;
  claimant?: string | null;
  note?: string | null;
  source?: string;
  taxClass:
    | "non_taxable_gain"
    | "taxable_gain"
    | "tax_deductible_expense"
    | "non_tax_deductible_expense"
    | "tax";
}) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.nutFinancePeriod.findUnique({
      where: { id: ACTIVE_PERIOD_ID },
    });
    if (!period)
      throw new Error(`NUT finance period ${ACTIVE_PERIOD_ID} was not found`);
    const amount = Math.max(0, Math.round(input.amount));
    const signed = input.type === "income" ? amount : -amount;
    const currentCash = toNumber(period.currentCash) + signed;
    const entry = await tx.nutLedgerEntry.create({
      data: {
        id: `ledger-manual-${crypto.randomUUID()}`,
        transactionDate: new Date(`${input.date}T00:00:00Z`),
        month: Number(input.date.slice(5, 7)),
        type: input.type,
        bucket: input.bucket,
        detail: input.detail,
        income: input.type === "income" ? BigInt(amount) : 0n,
        expense: input.type === "expense" ? BigInt(amount) : 0n,
        balance: BigInt(currentCash),
        amount: BigInt(amount),
        claimant: input.claimant ?? null,
        note: input.note ?? null,
        source: input.source ?? "Manual",
        taxClass: input.taxClass,
      },
    });
    await tx.nutFinancePeriod.update({
      where: { id: ACTIVE_PERIOD_ID },
      data: {
        currentCash: BigInt(currentCash),
        incomeActual:
          input.type === "income"
            ? period.incomeActual + BigInt(amount)
            : period.incomeActual,
        expenseActual:
          input.type === "expense"
            ? period.expenseActual + BigInt(amount)
            : period.expenseActual,
      },
    });
    if (input.type === "expense")
      await addBudgetSpending(tx, input.bucket, amount);
    return { entry, overview: await getFinanceOverview(tx) };
  });
}

export async function updateLedgerEntry(
  id: string,
  input: { claimant?: string | null; note?: string | null; detail?: string },
) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.nutLedgerEntry.update({
      where: { id },
      data: input,
    });
    return { entry, overview: await getFinanceOverview(tx) };
  });
}
