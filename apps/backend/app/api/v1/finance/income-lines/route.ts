import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { deleteIncomeLine, saveIncomeLine } from "@/nut/lib/financeRepository";
import { overviewBody, parseBody, periodFrom } from "@/nut/lib/respond";

// 수입 계획 줄. 쓰기는 apiHandler가 총무·admin만 통과시킨다.
const line = z.object({
  periodId: z.string().optional(),
  name: z.string().trim().min(1, "이름을 입력하세요."),
  budget: z.number().int().nonnegative("금액은 0 이상이어야 합니다."),
  note: z.string().trim().nullish(),
});

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, line);
  const periodId = await saveIncomeLine(await periodFrom(body.periodId), body);
  return { body: await overviewBody(periodId, member, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, line.extend({ id: z.string() }));
  const periodId = await saveIncomeLine(await periodFrom(body.periodId), body);
  return { body: await overviewBody(periodId, member, requestId) };
});

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.object({ id: z.string() }));
  return { body: await overviewBody(await deleteIncomeLine(body.id), member, requestId) };
});
