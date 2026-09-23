import { withApiHandler } from "@/lib/apiHandler";
import { requireAdmin } from "@/lib/auth";
import { ApiError, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { bulkRoleChangeSchema } from "@/lib/validation/admin";

// PATCH /api/v1/admin/members/role — 여러 명을 한 번에 acting/alumni로 전환.
// admin으로의 승격은 이 API로 불가능(스키마가 애초에 acting/alumni만 받음)하고,
// 대상 중 현재 role이 admin인 사람이 있으면 통째로 거부한다 — 관리자 계정은
// 이 화면에서 실수로도 건드릴 수 없게.
export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);

  const body = await req.json().catch(() => null);
  const parsed = bulkRoleChangeSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const { memberIds, role } = parsed.data;

  const result = await withIdempotency(req, member, "PATCH /admin/members/role", parsed.data, async (tx) => {
    const targets = await tx.member.findMany({ where: { id: { in: memberIds } } });
    if (targets.length !== memberIds.length) {
      throw new ApiError("NOT_FOUND", "존재하지 않는 회원이 포함되어 있습니다.");
    }
    if (targets.some((t) => t.role === "admin")) {
      throw new ApiError("FORBIDDEN", "관리자 계정의 role은 이 화면에서 바꿀 수 없습니다.");
    }

    await tx.member.updateMany({ where: { id: { in: memberIds } }, data: { role } });
    const updated = await tx.member.findMany({ where: { id: { in: memberIds } } });

    return {
      status: 200,
      body: successBody(
        { items: updated.map((m) => ({ id: m.id, role: m.role })) },
        requestId,
      ),
    };
  });

  return result;
});
