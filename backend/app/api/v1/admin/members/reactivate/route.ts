import { withApiHandler } from "@/lib/apiHandler";
import { requireAdmin } from "@/lib/auth";
import { ApiError, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { bulkDeactivateSchema } from "@/lib/validation/admin";

// POST /api/v1/admin/members/reactivate — 비활성화(deactivate)를 되돌린다.
// 같은 스키마(memberIds만 필요)를 재사용 — deactivate와 대칭인 동작이라
// 별도 스키마를 만들 이유가 없다. admin 계정은 애초에 비활성화가 안 되니
// 여기선 admin 대상 여부를 따로 막지 않는다(막아도 그만, 안 막아도 안전).
export const POST = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);

  const body = await req.json().catch(() => null);
  const parsed = bulkDeactivateSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { memberIds } = parsed.data;

  const result = await withIdempotency(req, member, "POST /admin/members/reactivate", parsed.data, async (tx) => {
    const targets = await tx.member.findMany({ where: { id: { in: memberIds } } });
    if (targets.length !== memberIds.length) {
      throw new ApiError("NOT_FOUND", "존재하지 않는 회원이 포함되어 있습니다.");
    }

    await tx.member.updateMany({ where: { id: { in: memberIds } }, data: { active: true } });
    const updated = await tx.member.findMany({ where: { id: { in: memberIds } } });

    return {
      status: 200,
      body: successBody(
        { items: updated.map((m) => ({ id: m.id, active: m.active })) },
        requestId,
      ),
    };
  });

  return result;
});
