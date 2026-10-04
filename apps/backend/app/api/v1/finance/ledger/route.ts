import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { createLedgerEntry, deleteLedgerEntry, updateLedgerEntry } from "@/nut/lib/financeRepository";
import { dateString, overviewBody, parseBody, periodFrom } from "@/nut/lib/respond";

const taxClass = z.enum(["non_taxable_gain", "taxable_gain", "tax_deductible_expense", "non_tax_deductible_expense", "tax"]);
const entry = z.object({
  date: dateString,
  type: z.enum(["income", "expense"]),
  bucket: z.string().trim().min(1, "항목을 고르세요."),
  detail: z.string().trim().min(1, "내용을 입력하세요."),
  amount: z.number().finite().nonnegative("금액은 0 이상이어야 합니다."),
  claimant: z.string().trim().nullish(),
  note: z.string().trim().nullish(),
  taxClass,
});

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, entry.extend({ periodId: z.string().optional() }));
  const periodId = await createLedgerEntry(await periodFrom(body.periodId), { ...body, source: "Manual" });
  return { body: await overviewBody(periodId, member, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const { id, ...input } = await parseBody(req, entry.partial().extend({ id: z.string().min(1) }));
  return { body: await overviewBody(await updateLedgerEntry(id, input), member, requestId) };
});

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const { id } = await parseBody(req, z.object({ id: z.string().min(1) }));
  return { body: await overviewBody(await deleteLedgerEntry(id), member, requestId) };
});
