import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { createLedgerEntry, updateLedgerEntry } from "@/lib/financeRepository";

const taxClasses = new Set(["non_taxable_gain", "taxable_gain", "tax_deductible_expense", "non_tax_deductible_expense", "tax"]);

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new ApiError("BAD_REQUEST", `${field} is required.`);
  return value.trim();
}

export const POST = withApiHandler(async (req, { requestId }) => {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new ApiError("BAD_REQUEST", "JSON body is required.");
  const date = requiredString(body.date, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("BAD_REQUEST", "date must be YYYY-MM-DD.");
  const type = requiredString(body.type, "type");
  if (type !== "income" && type !== "expense") throw new ApiError("BAD_REQUEST", "type must be income or expense.");
  const taxClass = requiredString(body.taxClass, "taxClass");
  if (!taxClasses.has(taxClass)) throw new ApiError("BAD_REQUEST", "taxClass is invalid.");
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0) throw new ApiError("BAD_REQUEST", "amount must be a non-negative number.");
  const result = await createLedgerEntry({ date, type, bucket: requiredString(body.bucket, "bucket"), detail: requiredString(body.detail, "detail"), amount: Math.round(body.amount), claimant: typeof body.claimant === "string" ? body.claimant.trim() : null, note: typeof body.note === "string" ? body.note.trim() : null, source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "Manual", taxClass: taxClass as Parameters<typeof createLedgerEntry>[0]["taxClass"] });
  return { body: successBody(result.overview, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { requestId }) => {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new ApiError("BAD_REQUEST", "JSON body is required.");
  const id = requiredString(body.id, "id");
  const result = await updateLedgerEntry(id, { claimant: typeof body.claimant === "string" ? body.claimant.trim() : null, note: typeof body.note === "string" ? body.note : null, detail: typeof body.detail === "string" && body.detail.trim() ? body.detail.trim() : undefined });
  return { body: successBody(result.overview, requestId) };
});
