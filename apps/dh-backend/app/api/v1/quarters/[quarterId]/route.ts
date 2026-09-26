import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { quarterCreatorSelect, serializeQuarter } from "@/lib/serializers/quarter";
import { updateQuarterSchema } from "@/lib/validation/quarter";

// PATCH /quarters/{quarterId} — 분기를 닫거나 다시 연다.
// 같은 값을 다시 보내도 결과가 같아서 멱등성 키를 요구하지 않는다.
export const PATCH = withApiHandler<{ quarterId: string }>(async (req, { params }) => {
  const body = await req.json().catch(() => null);
  const parsed = updateQuarterSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "active는 참/거짓이어야 합니다.");
  }

  const current = await prisma.quarter.findUnique({ where: { id: params.quarterId } });
  if (!current) throw new ApiError("NOT_FOUND", "분기를 찾을 수 없습니다.");

  const updated = await prisma.quarter.update({
    where: { id: params.quarterId },
    data: parsed.data.active
      ? { active: true, closedAt: null }
      : { active: false, closedAt: current.closedAt ?? new Date() },
    include: { createdBy: quarterCreatorSelect },
  });

  return { body: successBody(serializeQuarter(updated)) };
});
