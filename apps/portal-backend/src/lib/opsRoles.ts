import type { OpsRole } from "@/generated/prisma";

// 운영팀 직책 한 곳. DB enum(core.OpsRole)과 화면에 보이는 한국어 이름, 그리고
// "한 명만 가질 수 있는 직책"이 무엇인지를 여기서만 정의한다.
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
};

// 한 명만 가질 수 있는 직책. 팀원만 여러 명이다.
// 같은 규칙이 DB에도 부분 유니크 인덱스(members_ops_role_singleton_key)로 걸려
// 있다 — 여기서 먼저 검사하는 건 "누가 이미 그 직책인지"를 알려주는 오류 메시지를
// 만들기 위해서고, 동시 요청 같은 경합의 마지막 방어선은 DB 인덱스다.
const SINGLETON: Record<OpsRole, boolean> = {
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
};

export function isSingletonOpsRole(role: OpsRole): boolean {
  return SINGLETON[role];
}

export function opsRoleLabel(role: OpsRole): string {
  return OPS_ROLE_LABEL[role];
}
