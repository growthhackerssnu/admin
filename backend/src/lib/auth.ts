import type { NextRequest } from "next/server";
import type { Member, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { getSupabaseAuthClient } from "./supabase";
import { ApiError } from "./errors";

export type Capability = "view" | "review" | "send" | "start_cycle" | "manage_settings";

// alumni는 대협봇(dh) 자체에 접근할 수 없다 — getAuthenticatedMember에서 이미
// 막히므로 여기 capability는 의미상 도달하지 않지만, 빈 배열로 명시해둔다.
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

// 모든 업무 요청의 실행자·권한은 인증 정보로만 결정한다. 요청 바디의 `by`,
// 사용자 이름, PM 여부는 절대 신뢰하지 않는다 (api-contract.md §3).
export async function getAuthenticatedMember(req: NextRequest): Promise<Member> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    throw new ApiError("UNAUTHENTICATED", "인증 토큰이 없습니다.");
  }

  let supabaseUserId: string;
  let email: string;
  try {
    const { data, error } = await getSupabaseAuthClient().auth.getUser(token);
    if (error || !data.user?.email) {
      throw new ApiError("UNAUTHENTICATED", "유효하지 않거나 만료된 세션입니다.");
    }
    supabaseUserId = data.user.id;
    email = data.user.email;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("UNAUTHENTICATED", "인증 서비스에 연결할 수 없습니다.");
  }

  // 학회원 계정이 ghsnu.com/gmail.com/snu.ac.kr 등 도메인이 섞여 있어 도메인
  // 검사로는 못 거른다. Google OAuth 동의 화면을 External로 두고(Internal은
  // 단일 Workspace 도메인 소속 계정만 로그인 자체가 가능해서 이 조합과 안 맞음),
  // 실제 접근 통제는 아래 members 화이트리스트가 전담한다.
  let member = await prisma.member.findUnique({ where: { email } });

  if (!member) {
    throw new ApiError("FORBIDDEN", "이 계정은 대협봇 접근 권한이 없습니다. 관리자에게 문의하세요.");
  }
  if (!member.active) {
    throw new ApiError("FORBIDDEN", "비활성화된 계정입니다.");
  }
  // alumni는 admin.ghsnu.com/hr만 볼 수 있고 /dh(대협봇)는 접근 자체가 안 된다 —
  // 이 백엔드는 /dh 전용이므로 여기서 완전히 막는다.
  if (member.role === "alumni") {
    throw new ApiError("FORBIDDEN", "알럼나이 계정은 대협봇에 접근할 수 없습니다. admin.ghsnu.com/hr을 이용하세요.");
  }

  // 이 이메일의 첫 로그인이면 Supabase user id를 연결한다 — 관리자가 행을 만들
  // 때는 이 사람이 아직 로그인한 적이 없어서 이 값을 알 수 없다.
  if (member.supabaseUserId !== supabaseUserId) {
    member = await prisma.member.update({
      where: { id: member.id },
      data: { supabaseUserId },
    });
  }

  return member;
}

export function requireCapability(member: Member, capability: Capability) {
  if (!capabilitiesFor(member.role).includes(capability)) {
    throw new ApiError("FORBIDDEN", `이 작업에는 ${capability} 권한이 필요합니다.`);
  }
}
