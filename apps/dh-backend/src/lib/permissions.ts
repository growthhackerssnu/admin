import type { Member } from "@/generated/prisma";
import { ApiError } from "./errors";

// P-23: 팀원은 본인 담당 업무만 변경하고 타인 업무는 조회만 한다. 팀장은 전체를 변경한다.
//
// 기존 auth.ts의 capability 표는 **역할**(admin/acting)로 갈리는 축이라 이 규칙을
// 표현하지 못한다. 여기서 보는 건 "이 업무의 담당자가 누구인가"다.
//
// 담당자 판정 기준(v0.4 §6.1):
//   컨택 건이 있으면            Outreach.ownerId
//   아직 없으면(조사 단계)      원발견 배치의 SearchRun.assignedMemberId
//
// 탐색을 시작한 사람이 그 결과 기업의 첫 전송까지 담당한다(P-02). 보완 조사나 분기
// 이동으로 담당자가 바뀌지 않는다.

// 지금 이 저장소의 역할은 admin/acting/alumni뿐이고 alumni는 인증 단계에서 막힌다.
// 그래서 팀장 = admin이다. 별도 팀장 역할이 생기면 여기만 고치면 된다.
export function isTeamLead(member: Member): boolean {
  return member.role === "admin";
}

// 조회는 누구에게나 허용한다 — 막는 것은 변경뿐이다(P-23).
export function canModify(member: Member, ownerId: string | null): boolean {
  if (isTeamLead(member)) return true;
  // 담당자를 모르는 과거 행은 소유권을 추정하지 않고 팀장만 변경한다(v0.4 §1.2).
  if (!ownerId) return false;
  return ownerId === member.id;
}

// 단건 변경에서 권한이 없으면 403이다. 벌크는 이 함수를 쓰지 말고 항목별로 canModify를
// 확인해 rejected 처리한다 — 한 건 때문에 전체를 실패시키지 않는다(v0.4 §6.1).
export function assertCanModify(member: Member, ownerId: string | null): void {
  if (!canModify(member, ownerId)) {
    throw new ApiError("FORBIDDEN", "본인 담당 업무만 변경할 수 있습니다. 조회는 가능합니다.");
  }
}
