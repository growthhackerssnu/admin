import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { withPublicApiHandler } from "@/portal/lib/apiHandler";
import { ApiError, successBody } from "@/portal/lib/errors";
import { prisma } from "@/lib/prisma";
import { createClaim, resolvePeriodId } from "@/nut/lib/financeRepository";

// Slack 청구서 자동화 → NUT. 예전엔 Slack이 구글 시트에 행을 추가했다.
// 헤더 x-nut-webhook-secret이 NUT_CLAIMS_WEBHOOK_SECRET과 같아야 한다.
// 이메일이 회원 명단에 있으면 그 회원의 청구서로 연결해 NUT에서 본인 것으로 보인다.
function hasValidSecret(received: string | null) {
  const expected = process.env.NUT_CLAIMS_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

const schema = z.object({
  claimant: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  detail: z.string().trim().min(1),
  amount: z.coerce.number().int().positive(),
  bucket: z.string().trim().optional(),
  bankAccount: z.string().trim().max(100).optional(),
  prepaid: z.boolean().default(true),
  note: z.string().trim().max(500).optional(),
});

export const POST = withPublicApiHandler(async (req, { requestId }) => {
  if (!hasValidSecret(req.headers.get("x-nut-webhook-secret"))) throw new ApiError("UNAUTHENTICATED", "인증할 수 없습니다.");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
  const body = parsed.data;
  const member = body.email ? await prisma.member.findUnique({ where: { email: body.email } }) : null;
  const periodId = await resolvePeriodId(null);
  await createClaim(periodId, {
    ...body,
    // 예산 항목은 Slack 양식에 없을 수 있다. 총무가 지급 전에 정한다.
    bucket: body.bucket || "미분류",
    memberId: member?.id ?? null,
    source: "Slack",
  });
  return { status: 201, body: successBody({ periodId }, requestId) };
});
