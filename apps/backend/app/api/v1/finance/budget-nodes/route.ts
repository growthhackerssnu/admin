import { withApiHandler } from "@/nut/lib/apiHandler";
import { ApiError } from "@/nut/lib/errors";
import {
  createBudgetNode,
  reorderBudgetNodes,
  updateBudgetNode,
} from "@/nut/lib/financeRepository";
import { overviewBody, periodFrom } from "@/nut/lib/respond";

const levels = new Set(["major", "middle", "minor"]);
const kinds = new Set(["income", "expense", "tax"]);
const taxClasses = new Set([
  "non_taxable_gain",
  "taxable_gain",
  "tax_deductible_expense",
  "non_tax_deductible_expense",
  "tax",
]);

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError("BAD_REQUEST", `${field} is required.`);
  return value.trim();
}

function numberValue(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ApiError(
      "BAD_REQUEST",
      `${field} must be a non-negative number.`,
    );
  return Math.round(value);
}

function nodeInput(body: Record<string, unknown>, partial = false) {
  const input: Record<string, unknown> = {};
  if (!partial || body.name !== undefined)
    input.name = stringValue(body.name, "name");
  if (!partial || body.parentId !== undefined)
    input.parentId =
      body.parentId === null || body.parentId === ""
        ? null
        : stringValue(body.parentId, "parentId");
  if (!partial || body.level !== undefined) {
    const level = stringValue(body.level, "level");
    if (!levels.has(level))
      throw new ApiError(
        "BAD_REQUEST",
        "level must be major, middle, or minor.",
      );
    input.level = level;
  }
  if (!partial || body.kind !== undefined) {
    const kind = stringValue(body.kind, "kind");
    if (!kinds.has(kind))
      throw new ApiError(
        "BAD_REQUEST",
        "kind must be income, expense, or tax.",
      );
    input.kind = kind;
  }
  if (!partial || body.taxClass !== undefined) {
    const taxClass = stringValue(body.taxClass, "taxClass");
    if (!taxClasses.has(taxClass))
      throw new ApiError("BAD_REQUEST", "taxClass is invalid.");
    input.taxClass = taxClass;
  }
  if (!partial || body.budget !== undefined)
    input.budget = numberValue(body.budget, "budget");
  if (body.formula !== undefined)
    input.formula =
      body.formula === null || body.formula === ""
        ? null
        : stringValue(body.formula, "formula");
  if (body.formulaKey !== undefined)
    input.formulaKey =
      body.formulaKey === null || body.formulaKey === ""
        ? null
        : stringValue(body.formulaKey, "formulaKey");
  if (body.formulaExpression !== undefined)
    input.formulaExpression =
      body.formulaExpression === null || body.formulaExpression === ""
        ? null
        : stringValue(body.formulaExpression, "formulaExpression");
  if (body.note !== undefined)
    input.note =
      body.note === null || body.note === ""
        ? null
        : stringValue(body.note, "note");
  if (body.sortOrder !== undefined)
    input.sortOrder = numberValue(body.sortOrder, "sortOrder");
  return input;
}

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) throw new ApiError("BAD_REQUEST", "JSON body is required.");
  const periodId = await createBudgetNode(
    await periodFrom(body.periodId),
    nodeInput(body) as Parameters<typeof createBudgetNode>[1],
  );
  return { body: await overviewBody(periodId, member, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) throw new ApiError("BAD_REQUEST", "JSON body is required.");
  if (Array.isArray(body.ids)) {
    if (
      body.ids.length < 1 ||
      body.ids.some((id) => typeof id !== "string" || !id.trim())
    )
      throw new ApiError("BAD_REQUEST", "ids must contain bucket ids.");
    const periodId = await reorderBudgetNodes(body.ids as string[]);
    return { body: await overviewBody(periodId, member, requestId) };
  }
  const id = stringValue(body.id, "id");
  const periodId = await updateBudgetNode(
    id,
    nodeInput(body, true) as Parameters<typeof updateBudgetNode>[1],
  );
  return { body: await overviewBody(periodId, member, requestId) };
});

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) throw new ApiError("BAD_REQUEST", "JSON body is required.");
  const id = stringValue(body.id, "id");
  const periodId = await updateBudgetNode(id, { active: false });
  return { body: await overviewBody(periodId, member, requestId) };
});
