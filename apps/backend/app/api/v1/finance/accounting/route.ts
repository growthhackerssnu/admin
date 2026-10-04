import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import {
  createAccountingDetail,
  deleteAccountingDetail,
  deleteAccountingSummary,
  saveAccountingSummary,
  updateAccountingDetail,
} from "@/nut/lib/financeRepository";
import { dateString, overviewBody, parseBody, periodFrom } from "@/nut/lib/respond";

// 프로젝트·운영팀 지원비. kind=team은 팀(예산) 자체, kind=entry는 사용 내역 한 줄.
const scope = z.enum(["project", "team"]);
const money = z.number().int().nonnegative("금액은 0 이상이어야 합니다.");
const team = z.object({
  kind: z.literal("team"),
  periodId: z.string().optional(),
  id: z.string().optional(),
  scope,
  name: z.string().trim().min(1, "이름을 입력하세요."),
  supportBudget: money,
  technicalBudget: money,
  note: z.string().trim().nullish(),
});
const entry = z.object({
  kind: z.literal("entry"),
  periodId: z.string().optional(),
  scope,
  owner: z.string().trim().min(1),
  category: z.enum(["support", "technical"]),
  date: dateString,
  detail: z.string().trim().min(1, "내용을 입력하세요."),
  amount: money,
  claimant: z.string().trim().nullish(),
});

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.discriminatedUnion("kind", [team, entry]));
  const period = await periodFrom(body.periodId);
  const periodId =
    body.kind === "team" ? await saveAccountingSummary(period, body) : await createAccountingDetail(period, body);
  return { body: await overviewBody(periodId, member, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(
    req,
    z.discriminatedUnion("kind", [
      team.extend({ id: z.string() }),
      entry.partial().extend({ kind: z.literal("entry"), id: z.string() }),
    ]),
  );
  const periodId =
    body.kind === "team"
      ? await saveAccountingSummary(await periodFrom(body.periodId), body)
      : await updateAccountingDetail(body.id, body);
  return { body: await overviewBody(periodId, member, requestId) };
});

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.object({ kind: z.enum(["team", "entry"]), id: z.string() }));
  const periodId = body.kind === "team" ? await deleteAccountingSummary(body.id) : await deleteAccountingDetail(body.id);
  return { body: await overviewBody(periodId, member, requestId) };
});
