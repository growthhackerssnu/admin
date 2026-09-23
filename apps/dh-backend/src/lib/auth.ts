import type { Member, Role } from "@/generated/prisma";
import { createGetAuthenticatedMember, getSupabaseAuthClient } from "@dhbot/auth";
import { prisma } from "./prisma";
import { ApiError } from "./errors";

// ⚠️ 이 capability 시스템은 **아직 어떤 라우트에도 연결돼 있지 않다.**
// requireCapability를 호출하는 곳이 한 군데도 없으므로, 이걸 보고 "라우트가
// 권한별로 보호되고 있다"고 읽으면 안 된다.
//
// 지금 실제로 접근을 통제하는 건 아래 getAuthenticatedMember 하나다. 비명단·
// 비활성 계정과 alumni를 전부 막기 때문에, dh 라우트에 도달할 수 있는 건
// admin과 acting뿐이다.
//
// 연결하지 않은 이유: 이 표에서 admin과 acting의 차이는 manage_settings 하나뿐인데,
// 그걸 필요로 하는 라우트가 없다(템플릿 연결 관리 UI는 policies.md에서 범위 밖으로
// 뺐다). 지금 라우트마다 requireCapability를 붙여봐야 전부 통과하는 무의미한 검사가
// 되고, "권한 검사가 있다"는 잘못된 안심만 만든다.
//
// 역할별 권한 표 자체가 아직 미확정이다 — api-contract.md §3("권한 이름은 …
// 제안한다. 실제 역할별 권한 표는 합의한다")와 policies.md의 미정 사항("멤버·PM
// 권한") 참고. 그 합의가 끝나 admin/acting을 실제로 갈라야 할 때 이 표를 채우고
// 해당 라우트에 requireCapability를 붙인다. 그 전까지는 이 코드가 미사용이다.
export type Capability = "view" | "review" | "send" | "start_cycle" | "manage_settings";

// alumni는 빈 배열이지만 의미상 도달하지 않는다 — getAuthenticatedMember가 먼저 막는다.
// acting은 PM 서브권한 없이 업무 전체(차수 시작 포함) 동일. manage_settings만
// admin 전용(템플릿 연결 등 운영 설정).
const CAPABILITIES_BY_ROLE: Record<Role, Capability[]> = {
  admin: ["view", "review", "send", "start_cycle", "manage_settings"],
  acting: ["view", "review", "send", "start_cycle"],
  alumni: [],
};

export function capabilitiesFor(role: Role): Capability[] {
  return CAPABILITIES_BY_ROLE[role];
}

// 인증 정책(검사 순서, 거부 조건, 최근 접속 갱신 시점)은 @dhbot/auth에 한 벌만
// 있다. 여기서는 이 앱에만 해당하는 것 — Prisma 접근, ApiError, 거부 대상 — 만
// 주입한다. 규칙: docs/db/conventions.md §5.2
//
// 모든 업무 요청의 실행자·권한은 인증 정보로만 결정한다. 요청 바디의 `by`,
// 사용자 이름, PM 여부는 절대 신뢰하지 않는다 (api-contract.md §3).
//
// alumni는 admin.ghsnu.com/hr만 볼 수 있고 /dh(대협봇)는 접근 자체가 안 된다 —
// 이 백엔드는 /dh 전용이므로 deny로 완전히 막는다.
export const getAuthenticatedMember = createGetAuthenticatedMember<Member>({
  findByEmail: (email) => prisma.member.findUnique({ where: { email } }),
  markLogin: (id, supabaseUserId) =>
    prisma.member.update({ where: { id }, data: { supabaseUserId, lastLoginAt: new Date() } }),
  toError: (code, message) => new ApiError(code, message),
  getSupabaseClient: getSupabaseAuthClient,
  deny: ["alumni"],
  messages: {
    notMember: "이 계정은 대협봇 접근 권한이 없습니다. 관리자에게 문의하세요.",
    deniedRole: "알럼나이 계정은 대협봇에 접근할 수 없습니다. admin.ghsnu.com/hr을 이용하세요.",
  },
});

export function requireCapability(member: Member, capability: Capability) {
  if (!capabilitiesFor(member.role).includes(capability)) {
    throw new ApiError("FORBIDDEN", `이 작업에는 ${capability} 권한이 필요합니다.`);
  }
}
