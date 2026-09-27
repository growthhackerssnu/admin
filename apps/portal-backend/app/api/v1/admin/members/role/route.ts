import { withApiHandler } from "@/lib/apiHandler";
import { requireAdmin } from "@/lib/auth";
import { ApiError, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { isSingletonOpsRole, opsRoleLabel } from "@/lib/opsRoles";
import { bulkRoleChangeSchema } from "@/lib/validation/admin";

// PATCH /api/v1/admin/members/role — 여러 명을 한 번에 acting/alumni로 전환하고,
// acting이면 운영팀 직책(opsRole)까지 같이 지정한다.
//
// admin으로의 승격은 이 API로 불가능하고(스키마가 애초에 acting/alumni만 받음),
// 대상 중 현재 role이 admin인 사람이 있으면 통째로 거부한다 — 관리자 계정은
// 이 화면에서 실수로도 건드릴 수 없게.
//
// role과 운영팀 직책은 한 번에 같이 쓴다:
//   acting → 직책 필수. 이미 acting인 사람에게 이 API를 다시 부르면 직책만 바뀐다.
//   alumni → 직책은 NULL이 된다. 운영팀에서 나간 것이니 남겨둘 이유가 없다.
export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);

  const body = await req.json().catch(() => null);
  const parsed = bulkRoleChangeSchema.safeParse(body);
  if (!parsed.success) {
    // 직책 관련 실패는 관리자가 화면에서 바로 고칠 수 있는 것이라 문구를 그대로
    // 올려보낸다("입력값을 확인하세요"만 보면 무엇을 빠뜨렸는지 알 수 없다).
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "body";
      if (!(path in fieldErrors)) fieldErrors[path] = issue.message;
    }
    throw new ApiError("VALIDATION_ERROR", fieldErrors.opsRole ?? "입력값을 확인하세요.", { fieldErrors });
  }
  const { memberIds, role } = parsed.data;
  const opsRole = parsed.data.role === "acting" ? parsed.data.opsRole : null;

  const result = await withIdempotency(req, member, "PATCH /admin/members/role", parsed.data, async (tx) => {
    const targets = await tx.member.findMany({ where: { id: { in: memberIds } } });
    if (targets.length !== memberIds.length) {
      throw new ApiError("NOT_FOUND", "존재하지 않는 회원이 포함되어 있습니다.");
    }
    if (targets.some((t) => t.role === "admin")) {
      throw new ApiError("FORBIDDEN", "관리자 계정의 role은 이 화면에서 바꿀 수 없습니다.");
    }

    // 회장·부회장·총무·각 팀장은 한 명씩이다. DB에도 부분 유니크 인덱스가 있지만
    // (members_ops_role_singleton_key) 거기서 걸리면 "왜 안 되는지"를 알 수 없어서,
    // 먼저 확인해서 현재 그 직책인 사람을 문구에 담는다.
    if (opsRole && isSingletonOpsRole(opsRole)) {
      const label = opsRoleLabel(opsRole);
      if (memberIds.length > 1) {
        throw new ApiError("VALIDATION_ERROR", `${label} 직책은 한 명만 가질 수 있습니다. 한 명만 선택하세요.`, {
          fieldErrors: { opsRole: "1인 직책" },
        });
      }
      const holder = await tx.member.findFirst({ where: { opsRole, id: { notIn: memberIds } } });
      if (holder) {
        // 비활성 회원도 자리를 차지한다 — 비활성화는 role을 바꾸지 않기 때문이다.
        const suffix = holder.active ? "" : "(비활성 계정)";
        throw new ApiError(
          "VALIDATION_ERROR",
          `${label} 직책은 이미 ${holder.displayName} 님${suffix}이 맡고 있습니다. 그 회원의 직책을 먼저 옮기거나 alumni로 내리세요.`,
          { fieldErrors: { opsRole: "이미 지정된 직책" } },
        );
      }
    }

    await tx.member.updateMany({ where: { id: { in: memberIds } }, data: { role, opsRole } });
    const updated = await tx.member.findMany({ where: { id: { in: memberIds } } });

    return {
      status: 200,
      body: successBody(
        { items: updated.map((m) => ({ id: m.id, role: m.role, opsRole: m.opsRole })) },
        requestId,
      ),
    };
  });

  return result;
});
