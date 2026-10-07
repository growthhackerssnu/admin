import type { OpsRole } from "@/generated/prisma";
import { withApiHandler } from "@/portal/lib/apiHandler";
import { requireAdmin } from "@/portal/lib/auth";
import { ApiError, successBody } from "@/portal/lib/errors";
import { withIdempotency } from "@/portal/lib/idempotency";
import { isOfficeOpsRole, nextTeams, opsRoleTitle, sortOpsRoles } from "@/portal/lib/opsRoles";
import { bulkRoleChangeSchema } from "@/portal/lib/validation/admin";

// PATCH /api/v1/admin/members/role — 여러 명을 한 번에 acting/alumni로 전환하고,
// acting이면 운영팀 직책(임원·팀장 하나)과 팀원(여러 팀)까지 같이 지정한다.
//
// admin으로의 승격은 이 API로 불가능하고(스키마가 애초에 acting/alumni만 받음),
// 대상 중 현재 role이 admin인 사람이 있으면 통째로 거부한다 — 관리자 계정은
// 이 화면에서 실수로도 건드릴 수 없게.
//
// role과 운영팀 직책은 한 번에 같이 쓴다:
//   acting → 직책이나 팀원이 하나 이상 남아야 한다. 이미 acting이면 직책·팀원만 바뀐다.
//            office를 생략하면 각자 지금 직책을 그대로 둔다(여럿을 골라 팀원만 바꿀 때).
//   alumni → 직책·팀원을 전부 지운다. 운영팀에서 나간 것이니 남겨둘 이유가 없다.
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
    throw new ApiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "입력값을 확인하세요.", { fieldErrors });
  }
  const change = parsed.data;
  const { memberIds } = change;

  const result = await withIdempotency(req, member, "PATCH /admin/members/role", change, async (tx) => {
    const targets = await tx.member.findMany({
      where: { id: { in: memberIds } },
      include: { opsRoles: true, claimedPersonEntry: { select: { cohortNormalized: true } } },
    });
    if (targets.length !== memberIds.length) {
      throw new ApiError("NOT_FOUND", "존재하지 않는 회원이 포함되어 있습니다.");
    }
    if (targets.some((t) => t.role === "admin")) {
      throw new ApiError("FORBIDDEN", "관리자 계정의 role은 이 화면에서 바꿀 수 없습니다.");
    }

    let rows: { memberId: string; opsRole: OpsRole; cohort: number | null }[] = [];
    if (change.role === "acting") {
      const { teams, addTeams = [], removeTeams = [] } = change;
      // 여럿을 고르면 바꾼 팀만 넣고 뺀다 — 통째로 바꾸면 한 사람에게만 있던 팀이 지워진다.
      if (teams && memberIds.length > 1) {
        throw new ApiError("VALIDATION_ERROR", "여럿을 고르면 팀원 목록을 통째로 바꿀 수 없습니다. 넣거나 뺄 팀만 보내세요.", {
          fieldErrors: { teams: "한 명일 때만" },
        });
      }
      if (teams && (addTeams.length > 0 || removeTeams.length > 0)) {
        throw new ApiError("VALIDATION_ERROR", "teams와 addTeams/removeTeams는 함께 보낼 수 없습니다.", {
          fieldErrors: { teams: "둘 중 하나" },
        });
      }
      if (addTeams.some((team) => removeTeams.includes(team))) {
        throw new ApiError("VALIDATION_ERROR", "같은 팀을 넣고 동시에 뺄 수 없습니다.", { fieldErrors: { addTeams: "겹침" } });
      }
      // 직책의 기수는 그 사람의 기수다(19기는 19기 회장만). 그핵드인 명단에 없으면 모른다(null).
      const officeCohort = Number(targets[0]?.claimedPersonEntry?.cohortNormalized) || null;
      const office = change.office ? { opsRole: change.office, cohort: officeCohort } : change.office;
      if (office) {
        const title = opsRoleTitle(office);
        if (memberIds.length > 1) {
          throw new ApiError("VALIDATION_ERROR", `${title} 직책은 한 명만 가질 수 있습니다. 한 명만 선택하세요.`, {
            fieldErrors: { office: "1인 직책" },
          });
        }
        // 같은 직책·같은 기수는 한 명이다. DB에도 부분 유니크 인덱스가 있지만
        // (member_ops_roles_office_cohort_key) 거기서 걸리면 "왜 안 되는지"를 알 수 없어서,
        // 먼저 확인해서 지금 그 자리인 사람을 문구에 담는다. 다른 기수의 같은 직책은 괜찮다(인수인계).
        // 기수를 모르면(null) 기수를 모르는 같은 직책끼리 부딪힌다(member_ops_roles_office_unknown_cohort_key).
        const holder = await tx.memberOpsRole.findFirst({
          where: { opsRole: office.opsRole, cohort: office.cohort, memberId: { notIn: memberIds } },
          include: { member: true },
        });
        if (holder) {
          // 비활성 회원도 자리를 차지한다 — 비활성화는 role을 바꾸지 않기 때문이다.
          const suffix = holder.member.active ? "" : "(비활성 계정)";
          throw new ApiError(
            "VALIDATION_ERROR",
            `${title} 직책은 이미 ${holder.member.displayName} 님${suffix}이 맡고 있습니다. 그 회원의 직책을 먼저 옮기거나 alumni로 내리세요.`,
            { fieldErrors: { office: "이미 지정된 직책" } },
          );
        }
      }

      for (const target of targets) {
        // office를 생략하면 지금 직책을 그대로 둔다.
        const kept = office === undefined ? target.opsRoles.filter((r) => isOfficeOpsRole(r.opsRole)) : [];
        const next = [
          ...kept.map((r) => ({ memberId: target.id, opsRole: r.opsRole, cohort: r.cohort })),
          ...(office ? [{ memberId: target.id, opsRole: office.opsRole, cohort: office.cohort }] : []),
          ...nextTeams(target.opsRoles, teams, addTeams, removeTeams).map((opsRole) => ({
            memberId: target.id,
            opsRole,
            cohort: null,
          })),
        ];
        if (next.length === 0) {
          throw new ApiError(
            "VALIDATION_ERROR",
            `${target.displayName} 님에게 직책이나 팀이 하나도 없습니다. acting으로 두려면 하나 이상 지정하세요.`,
            { fieldErrors: { teams: "직책이나 팀 필요" } },
          );
        }
        rows.push(...next);
      }
    } else {
      rows = [];
    }

    await tx.memberOpsRole.deleteMany({ where: { memberId: { in: memberIds } } });
    if (rows.length > 0) await tx.memberOpsRole.createMany({ data: rows });
    // 옛 컬럼(ops_role)은 아무도 읽지 않는다. alumni로 내릴 때만 비운다 — CHECK 제약
    // members_ops_role_acting_only가 alumni에게 값이 남아 있는 걸 막기 때문이다.
    await tx.member.updateMany({
      where: { id: { in: memberIds } },
      data: change.role === "alumni" ? { role: "alumni", legacyOpsRole: null } : { role: "acting" },
    });
    const updated = await tx.member.findMany({ where: { id: { in: memberIds } }, include: { opsRoles: true } });

    return {
      status: 200,
      body: successBody(
        {
          items: updated.map((m) => ({
            id: m.id,
            role: m.role,
            opsRoles: sortOpsRoles(m.opsRoles).map((r) => ({ opsRole: r.opsRole, cohort: r.cohort })),
          })),
        },
        requestId,
      ),
    };
  });

  return result;
});

