import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { actOnClaim } from "@/nut/lib/financeRepository";
import { dateString, overviewBody, parseBody } from "@/nut/lib/respond";

// 청구서는 Slack 워크플로로 들어온다(/api/v1/internal/nut/claims). 여기선 승인·반려·다시 열기·지급,
// 그리고 결제 수단(법인카드/개인 카드) 고치기만.
export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(
    req,
    z.discriminatedUnion("type", [
      z.object({ id: z.string(), type: z.literal("approve"), bucket: z.string().trim().optional() }),
      z.object({ id: z.string(), type: z.literal("reject"), reason: z.string().trim().min(1, "반려 사유를 적어주세요.") }),
      z.object({ id: z.string(), type: z.literal("reopen") }),
      z.object({ id: z.string(), type: z.literal("card"), prepaid: z.boolean() }),
      z.object({ id: z.string(), type: z.literal("pay"), date: dateString, bucket: z.string().trim().optional(), teamId: z.string().nullish() }),
    ]),
  );
  const { id, ...action } = body;
  return { body: await overviewBody(await actOnClaim(id, action, member.id), member, requestId) };
});
