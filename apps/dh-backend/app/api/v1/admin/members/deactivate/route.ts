import { withApiHandler } from "@/lib/apiHandler";
import { requireAdmin } from "@/lib/auth";
import { ApiError, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { bulkDeactivateSchema } from "@/lib/validation/admin";

// POST /api/v1/admin/members/deactivate — 여러 명을 한 번에 비활성화("삭제").
// 실제 행은 지우지 않는다 — outreaches.ownerId/responses.checkedById 등 이
// 사람을 참조하는 업무 기록이 있어서 하드 삭제하면 그 이력이 깨진다. active=false로
// 접근만 막는다(members:remove CLI와 동일한 의미). 관리자 계정과 "나 자신"은
// 이 API로 비활성화할 수 없다 — 관리자가 유일한데 그걸 여기서 잠글 수 있으면 안 됨.
export const POST = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);

  const body = await req.json().catch(() => null);
  const parsed = bulkDeactivateSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { memberIds } = parsed.data;

  if (memberIds.includes(member.id)) {
    throw new ApiError("VALIDATION_ERROR", "본인 계정은 이 화면에서 비활성화할 수 없습니다.");
  }

  const result = await withIdempotency(req, member, "POST /admin/members/deactivate", parsed.data, async (tx) => {
    const targets = await tx.member.findMany({ where: { id: { in: memberIds } } });
    if (targets.length !== memberIds.length) {
      throw new ApiError("NOT_FOUND", "존재하지 않는 회원이 포함되어 있습니다.");
    }
    if (targets.some((t) => t.role === "admin")) {
      throw new ApiError("FORBIDDEN", "관리자 계정은 비활성화할 수 없습니다.");
    }

    await tx.member.updateMany({ where: { id: { in: memberIds } }, data: { active: false } });
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
