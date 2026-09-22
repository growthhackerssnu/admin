import type { NextRequest } from "next/server";
import type { Member, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { getSupabaseAuthClient } from "./supabase";
import { ApiError } from "./errors";

export type Capability = "view" | "review" | "send" | "start_cycle" | "manage_settings";

const CAPABILITIES_BY_ROLE: Record<Role, Capability[]> = {
  member: ["view", "review", "send"],
  pm: ["view", "review", "send", "start_cycle", "manage_settings"],
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

  // Google OAuth 동의 화면이 Internal이면 이 도메인 밖 계정은 로그인 자체가
  // 안 되지만, 설정이 바뀌거나 다른 방식이 섞여도 안전하도록 한 번 더 검사한다.
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (allowedDomain && !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
    throw new ApiError("FORBIDDEN", "학회 이메일 계정으로만 접근할 수 있습니다.");
  }

  const member = await prisma.member.upsert({
    where: { supabaseUserId },
    update: { email },
    create: {
      supabaseUserId,
      email,
      displayName: email.split("@")[0] ?? email,
      role: "member",
      active: true,
    },
  });

  if (!member.active) {
    throw new ApiError("FORBIDDEN", "비활성화된 계정입니다.");
  }

  return member;
}

export function requireCapability(member: Member, capability: Capability) {
  if (!capabilitiesFor(member.role).includes(capability)) {
    throw new ApiError("FORBIDDEN", `이 작업에는 ${capability} 권한이 필요합니다.`);
  }
}
