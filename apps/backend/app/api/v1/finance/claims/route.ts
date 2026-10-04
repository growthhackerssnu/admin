import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { ApiError } from "@/nut/lib/errors";
import { actOnClaim, cancelOwnClaim, createClaim } from "@/nut/lib/financeRepository";
import { canManageClaims, dateString, overviewBody, parseBody, periodFrom } from "@/nut/lib/respond";

// 청구하기: NUT에 들어올 수 있는 회원이면 누구나. 청구인은 로그인한 본인.
export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(
    req,
    z.object({
      periodId: z.string().optional(),
      date: dateString,
      detail: z.string().trim().min(1, "무엇에 쓴 돈인지 적어주세요."),
      amount: z.number().int().positive("금액을 입력하세요."),
      bucket: z.string().trim().min(1, "예산 항목을 고르세요."),
      bankAccount: z.string().trim().max(100).optional(),
      prepaid: z.boolean().default(true),
      note: z.string().trim().max(500).optional(),
    }),
  );
  const periodId = await createClaim(await periodFrom(body.periodId), {
    ...body,
    memberId: member.id,
    claimant: member.displayName ?? member.email,
    source: "NUT",
  });
  return { body: await overviewBody(periodId, member, requestId), status: 201 };
});

// 승인·반려·다시 열기·지급은 처리 권한자만.
export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  if (!canManageClaims(member)) throw new ApiError("FORBIDDEN", "청구서 처리는 총무·회장단만 할 수 있습니다.");
  const body = await parseBody(
    req,
    z.discriminatedUnion("type", [
      z.object({ id: z.string(), type: z.literal("approve"), bucket: z.string().trim().optional() }),
      z.object({ id: z.string(), type: z.literal("reject"), reason: z.string().trim().min(1, "반려 사유를 적어주세요.") }),
      z.object({ id: z.string(), type: z.literal("reopen") }),
      z.object({ id: z.string(), type: z.literal("pay"), date: dateString, bucket: z.string().trim().optional() }),
    ]),
  );
  const { id, ...action } = body;
  return { body: await overviewBody(await actOnClaim(id, action, member.id), member, requestId) };
});

// 본인 청구서 취소(검토 중일 때만).
export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const { id } = await parseBody(req, z.object({ id: z.string() }));
  return { body: await overviewBody(await cancelOwnClaim(id, member.id), member, requestId) };
});
