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

  // 토큰이 유효하고 활성 계정이면 — dh 업무 권한이 없는 alumni라도 — "이 사람이
  // 방금 접근을 시도했다"는 사실 자체는 남긴다. 관리자 명단 화면의 "최근 접속일"이
  // alumni에게도 의미 있으려면 이 시점(권한 체크보다 먼저)에 갱신해야 한다.
  member = await prisma.member.update({
    where: { id: member.id },
    data: { supabaseUserId, lastLoginAt: new Date() },
  });

  // alumni는 admin.ghsnu.com/hr만 볼 수 있고 /dh(대협봇)는 접근 자체가 안 된다 —
  // 이 백엔드는 /dh 전용이므로 여기서 완전히 막는다.
  if (member.role === "alumni") {
    throw new ApiError("FORBIDDEN", "알럼나이 계정은 대협봇에 접근할 수 없습니다. admin.ghsnu.com/hr을 이용하세요.");
  }

  return member;
}

export function requireCapability(member: Member, capability: Capability) {
  if (!capabilitiesFor(member.role).includes(capability)) {
    throw new ApiError("FORBIDDEN", `이 작업에는 ${capability} 권한이 필요합니다.`);
  }
}

// 회원 명단 조회·role 변경·비활성화(admin.ghsnu.com/admin이 호출할 API)는
// capabilitiesFor 체계(view/review/send 같은 dh 업무 권한)와 별개로, admin
// role인지만 직접 확인한다 — acting에게도 열어줄 이유가 없는 완전히 다른 종류의
// 권한이라 CAPABILITIES_BY_ROLE에 억지로 끼워 넣지 않는다.
export function requireAdmin(member: Member) {
  if (member.role !== "admin") {
    throw new ApiError("FORBIDDEN", "관리자만 접근할 수 있습니다.");
  }
}
