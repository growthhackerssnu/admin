import type { OpsRole, Prisma } from "@/generated/prisma";

// 운영팀 직책 한 곳. DB enum(core.OpsRole)과 화면에 보이는 한국어 이름, 그리고
// "직책(한 사람이 하나만, 기수마다 한 명)"과 "팀원(여럿)"의 구분을 여기서만 정의한다.
//
// 한 회원이 여러 개를 가질 수 있다(core.member_ops_roles): 직책은 하나까지, 팀원은 여러 팀.
// 예: 총무이면서 대외협력 팀원·에듀 팀원, 회장이면서 PR 팀원.
//
// OPS_ROLES는 어드민 화면의 표시 순서이기도 하다(임원 → 팀장 → 팀원).
// 아래 Record<OpsRole, ...>들 덕분에 packages/db에 enum 값을 추가하고 이 파일을
// 안 고치면 타입 검사에서 걸린다.
export const OPS_ROLES = [
  "president",
  "vice_president",
  "treasurer",
  "external_lead",
  "hr_lead",
  "pr_lead",
  "edu_lead",
  "external_member",
  "hr_member",
  "pr_member",
  "edu_member",
] as const satisfies readonly OpsRole[];

export const OPS_ROLE_LABEL: Record<OpsRole, string> = {
  president: "회장",
  vice_president: "부회장",
  treasurer: "총무",
  external_lead: "대외협력 팀장",
  hr_lead: "HR 팀장",
  pr_lead: "PR 팀장",
  edu_lead: "에듀 팀장",
  external_member: "대외협력 팀원",
  hr_member: "HR 팀원",
  pr_member: "PR 팀원",
  edu_member: "에듀 팀원",
};

// 직책: 한 사람이 하나만 가질 수 있고, 같은 직책은 기수마다 한 명이다. 팀원만 여럿이다.
// 같은 규칙이 DB에도 부분 유니크 인덱스(member_ops_roles_*_key)로 걸려 있다 — 여기서
// 먼저 검사하는 건 "누가 이미 그 직책인지"를 알려주는 오류 메시지를 만들기 위해서고,
// 동시 요청 같은 경합의 마지막 방어선은 DB 인덱스다.
const OFFICE: Record<OpsRole, boolean> = {
  president: true,
  vice_president: true,
  treasurer: true,
  external_lead: true,
  hr_lead: true,
  pr_lead: true,
  edu_lead: true,
  external_member: false,
  hr_member: false,
  pr_member: false,
  edu_member: false,
};

export const OFFICE_ROLES = OPS_ROLES.filter((role) => OFFICE[role]);
export const TEAM_ROLES = OPS_ROLES.filter((role) => !OFFICE[role]);

export function isOfficeOpsRole(role: OpsRole): boolean {
  return OFFICE[role];
}

export function opsRoleLabel(role: OpsRole): string {
  return OPS_ROLE_LABEL[role];
}

// "19기 회장"처럼 보여줄 이름. 직책의 기수는 그 사람의 기수다. 기수를 모르면 이름만.
export function opsRoleTitle(role: { opsRole: OpsRole; cohort: number | null }): string {
  return role.cohort ? `${role.cohort}기 ${OPS_ROLE_LABEL[role.opsRole]}` : OPS_ROLE_LABEL[role.opsRole];
}

// 로그인한 회원은 직책까지 같이 읽는다 — 네 도메인의 getAuthenticatedMember가 이 include를 쓴다.
export const memberWithOpsRoles = { opsRoles: true } satisfies Prisma.MemberInclude;
export type MemberWithOpsRoles = Prisma.MemberGetPayload<{ include: typeof memberWithOpsRoles }>;

// 권한 판정은 이 함수로만 한다. 직책을 여럿 가질 수 있어서 member.opsRole 같은 단일 값은 없다.
export function hasOpsRole(member: { opsRoles: readonly { opsRole: OpsRole }[] }, ...roles: OpsRole[]): boolean {
  return member.opsRoles.some((r) => roles.includes(r.opsRole));
}

// 표시 순서(임원 → 팀장 → 팀원)로 정렬한다.
export function sortOpsRoles<T extends { opsRole: OpsRole }>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => OPS_ROLES.indexOf(a.opsRole) - OPS_ROLES.indexOf(b.opsRole));
}
