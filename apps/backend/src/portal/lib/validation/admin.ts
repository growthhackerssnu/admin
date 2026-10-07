import { z } from "zod";
import type { OpsRole } from "@/generated/prisma";
import { OFFICE_ROLES, TEAM_ROLES } from "../opsRoles";

const memberIds = z.array(z.string().min(1)).min(1, "최소 한 명은 선택해야 합니다.");

// admin으로의 승격/강등은 이 API로 하지 않는다 — 수동(CLI/직접 DB)으로만.
//
// role과 운영팀 직책은 같이 움직인다. acting에게는 직책(임원·팀장)이나 팀원 중 하나
// 이상이 있어야 하고 alumni에게는 없다. 한 사람이 직책은 하나까지, 팀원은 여러 팀을
// 가질 수 있다(src/portal/lib/opsRoles.ts).
//
// acting으로 둘 때:
//   teams  — 팀원 목록. 그 사람의 팀원 목록을 이걸로 바꾼다(빈 배열이면 팀원 없음). 한 명일 때만.
//   addTeams/removeTeams — 여럿을 골랐을 때: 이 팀만 넣고 뺀다. 각자 원래 있던 다른 팀은 그대로다
//            (여럿을 teams로 통째로 바꾸면 한 사람에게만 있던 팀이 지워진다 — 2026-10-07 사고).
//   office — 직책. 생략하면 각자 지금 직책을 그대로 둔다(여럿을 골라 팀원만 바꿀 때).
//            null이면 직책을 뺀다. 직책을 주는 건 한 명을 골랐을 때만. 직책의 기수는 받지
//            않는다 — 19기는 19기 회장만 될 수 있어서, 그 사람의 기수(그핵드인 명단)를 쓴다.
// "그 직책·기수를 이미 다른 사람이 갖고 있는지" 같은 사람 관련 규칙은 라우트에서
// 검사한다 — 누가 갖고 있는지 알려주려면 DB를 봐야 한다.
const officeRole = z.enum(OFFICE_ROLES as [OpsRole, ...OpsRole[]], {
  invalid_type_error: "직책 값이 올바르지 않습니다.",
});
const teamRole = z.enum(TEAM_ROLES as [OpsRole, ...OpsRole[]], {
  invalid_type_error: "팀원 값이 올바르지 않습니다.",
});

const teamList = z
  .array(teamRole)
  .refine((teams) => new Set(teams).size === teams.length, "같은 팀이 두 번 들어 있습니다.");

export const bulkRoleChangeSchema = z.discriminatedUnion("role", [
  z.object({
    memberIds,
    role: z.literal("acting"),
    teams: teamList.optional(),
    addTeams: teamList.optional(),
    removeTeams: teamList.optional(),
    office: officeRole.nullable().optional(),
  }),
  z.object({
    memberIds,
    role: z.literal("alumni"),
  }),
]);

export const bulkDeactivateSchema = z.object({
  memberIds,
});

export const issueGhbotTokenSchema = z.object({
  memberId: z.string().min(1),
});
