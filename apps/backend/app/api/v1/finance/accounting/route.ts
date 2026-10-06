import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { deleteAccountingSummary, saveAccountingSummary } from "@/nut/lib/financeRepository";
import { overviewBody, parseBody, periodFrom } from "@/nut/lib/respond";

// 프로젝트·운영팀(예산). 쓴 내역은 거래 내역에서 회계 행에 팀을 지정해서 모은다.
const money = z.number().int().nonnegative("금액은 0 이상이어야 합니다.");
const team = z.object({
  periodId: z.string().optional(),
  scope: z.enum(["project", "team"]),
  term: z.enum(["summer", "regular", ""]).optional(),
  name: z.string().trim().min(1, "이름을 입력하세요."),
  supportBudget: money,
  technicalBudget: money,
  note: z.string().trim().nullish(),
});

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, team);
  const periodId = await saveAccountingSummary(await periodFrom(body.periodId), body);
  return { body: await overviewBody(periodId, member, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, team.extend({ id: z.string() }));
  const periodId = await saveAccountingSummary(await periodFrom(body.periodId), body);
  return { body: await overviewBody(periodId, member, requestId) };
});

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.object({ id: z.string() }));
  return { body: await overviewBody(await deleteAccountingSummary(body.id), member, requestId) };
});
