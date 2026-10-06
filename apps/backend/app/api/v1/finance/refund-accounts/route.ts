import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { deleteRefundAccount, saveRefundAccount } from "@/nut/lib/financeRepository";
import { overviewBody, parseBody, periodFrom } from "@/nut/lib/respond";

// 회원 환급 계좌. 쓰기는 apiHandler가 총무·admin만 통과시킨다.
const account = z.object({
  periodId: z.string().optional(),
  name: z.string().trim().min(1, "이름을 입력하세요."),
  cohort: z.string().trim().nullish(),
  email: z.string().trim().email("이메일 형식이 아닙니다.").or(z.literal("")).nullish(),
  bankAccount: z.string().trim().min(1, "계좌를 입력하세요.").max(100),
});

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, account);
  await saveRefundAccount(body);
  return { body: await overviewBody(await periodFrom(body.periodId), member, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, account.extend({ id: z.string() }));
  await saveRefundAccount(body);
  return { body: await overviewBody(await periodFrom(body.periodId), member, requestId) };
});

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.object({ id: z.string(), periodId: z.string().optional() }));
  await deleteRefundAccount(body.id);
  return { body: await overviewBody(await periodFrom(body.periodId), member, requestId) };
});
