import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { successBody } from "@/nut/lib/errors";
import { parseBody } from "@/nut/lib/respond";
import { getTaxOverview, setTaxInput } from "@/nut/lib/taxRepository";

// ?fy=2026 (= 2025-12-01 ~ 2026-11-30). 보기는 모두, 입력값 저장은 총무·admin(apiHandler).
export const GET = withApiHandler(async (req, { requestId }) => {
  const fy = Number(req.nextUrl.searchParams.get("fy")) || null;
  return { body: successBody(await getTaxOverview(fy), requestId) };
});

const key = z.string().regex(/^(fy:\d{4}:(reserve-rate|business-paid|other-paid)|vat:\d{4}-[12]:(input-tax|vat-included))$/);

export const POST = withApiHandler(async (req, { requestId }) => {
  const body = await parseBody(req, z.object({ fy: z.number().int(), key, value: z.number().finite().nonnegative() }));
  await setTaxInput(body.key, body.value);
  return { body: successBody(await getTaxOverview(body.fy), requestId) };
});
