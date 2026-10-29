import type { OpsRole } from "@/generated/prisma";
import { OPS_ROLES, isOfficeOpsRole } from "@/portal/lib/opsRoles";

// 노션 People DB의 "직책"(select)·"소속팀"(multi_select) ↔ 운영팀 직책(core.OpsRole).
//
// 노션 값은 이력이다 — 알럼나이도 자기 기수 때 맡았던 직책·팀이 그대로 남아 있다. 그래서 이
// 값을 운영팀 직책으로 옮기는 건 지금 acting인 회원뿐이다(opsRoleSync.ts).
// 노션의 직책은 그 사람의 기수 직책이고, 어드민도 직책의 기수를 그 사람의 기수로만 받는다 —
// 그래서 기수 없이 이름끼리만 짝지으면 된다.
//
// 팀장의 자기 팀: 노션은 팀장도 소속팀에 자기 팀을 넣고(HR팀장 → 소속팀 HR), 어드민은 팀장만 둔다.
// 그래서 노션에서 읽을 땐 팀장의 자기 팀 팀원을 빼고, 노션에 쓸 땐 넣는다. 비교도 이 기준으로 한다
// (어드민에 팀장 + 자기 팀 팀원이 같이 있어도 팀장만 있는 것과 같다).
// 짝이 없는 노션 값(NUT 팀 등)은 무시하고, 어드민에서 노션으로 쓸 때도 건드리지 않고 남긴다.
export const NOTION_POSITION_PROPERTY = "직책";
export const NOTION_TEAM_PROPERTY = "소속팀";

const NOTION_POSITION: Partial<Record<OpsRole, string>> = {
  president: "회장",
  vice_president: "부회장",
  treasurer: "총무 / 내부운영팀장",
  external_lead: "대외협력팀장",
  hr_lead: "HR팀장",
  pr_lead: "PR팀장",
  edu_lead: "교육팀장",
};

const NOTION_TEAM: Partial<Record<OpsRole, string>> = {
  external_member: "DH",
  hr_member: "HR",
  pr_member: "PR",
  edu_member: "EDU",
};

const TEAM_NAMES = new Set(Object.values(NOTION_TEAM));

const LEAD_TEAM: Partial<Record<OpsRole, OpsRole>> = {
  external_lead: "external_member",
  hr_lead: "hr_member",
  pr_lead: "pr_member",
  edu_lead: "edu_member",
};

// 팀장의 자기 팀 팀원을 뺀다(위 "팀장의 자기 팀" 참고).
function withoutLeadTeam(roles: readonly OpsRole[]): OpsRole[] {
  const implied = roles.map((role) => LEAD_TEAM[role]).filter(Boolean);
  return roles.filter((role) => !implied.includes(role));
}

// 표시 순서(임원 → 팀장 → 팀원)로 정렬해서 돌려준다 — 비교·저장을 순서와 무관하게 하려고.
export function opsRolesFromNotion(position: string | null, teams: readonly string[]): OpsRole[] {
  return withoutLeadTeam(
    OPS_ROLES.filter((role) =>
      isOfficeOpsRole(role) ? NOTION_POSITION[role] === position : teams.includes(NOTION_TEAM[role]!),
    ),
  );
}

// 운영팀 직책을 노션 값으로. 소속팀 중 짝이 없는 값(NUT 등)은 그대로 둔다.
export function opsRolesToNotion(
  roles: readonly OpsRole[],
  currentTeams: readonly string[],
): { position: string | null; teams: string[] } {
  const office = roles.find(isOfficeOpsRole);
  const withLeadTeam = office && LEAD_TEAM[office] ? [...roles, LEAD_TEAM[office]] : roles;
  const mapped = OPS_ROLES.filter((role) => withLeadTeam.includes(role) && !isOfficeOpsRole(role)).map(
    (role) => NOTION_TEAM[role]!,
  );
  return {
    position: office ? NOTION_POSITION[office]! : null,
    teams: [...currentTeams.filter((team) => !TEAM_NAMES.has(team)), ...mapped],
  };
}

export function sameOpsRoles(a: readonly OpsRole[], b: readonly OpsRole[]): boolean {
  const [x, y] = [new Set(withoutLeadTeam(a)), new Set(withoutLeadTeam(b))];
  return x.size === y.size && [...x].every((role) => y.has(role));
}
