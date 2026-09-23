import type { NextRequest } from "next/server";
import type { Member } from "@/generated/prisma";
import { prisma } from "./prisma";
import { getSupabaseAuthClient } from "./supabase";
import { ApiError } from "./errors";

// admin.ghsnu.com 루트 경험(로그인·가입·회원 관리)은 role 전부(admin/acting/
// alumni)를 상대한다 — apps/dh-backend의 getAuthenticatedMember와 달리
// alumni를 여기서 막지 않는다. alumni도 로그인해서 /me로 자기 role을 알아야
// 어디로 갈지(hr) 정할 수 있고, admin 화면의 명단에도 alumni가 나와야 한다.
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
  // 검사로는 못 거른다. 실제 접근 통제는 members 화이트리스트가 전담한다.
  let member = await prisma.member.findUnique({ where: { email } });

  if (!member) {
    throw new ApiError("FORBIDDEN", "이 계정은 admin.ghsnu.com 접근 권한이 없습니다. 관리자에게 문의하세요.");
  }
  if (!member.active) {
    throw new ApiError("FORBIDDEN", "비활성화된 계정입니다.");
  }

  member = await prisma.member.update({
    where: { id: member.id },
    data: { supabaseUserId, lastLoginAt: new Date() },
  });

  return member;
}

// 회원 명단 조회·role 변경·비활성화는 admin role인지만 직접 확인한다 —
// acting에게도 열어줄 이유가 없는 완전히 다른 종류의 권한이다.
export function requireAdmin(member: Member) {
  if (member.role !== "admin") {
    throw new ApiError("FORBIDDEN", "관리자만 접근할 수 있습니다.");
  }
}

// 로그인 성공 직후 어디로 보낼지 — admin은 회원 관리, acting은 대협봇(dh),
// alumni는 그핵드인(hr). 프로덕션에서는 gateway가 같은 origin 아래 /dh, /hr로
// rewrite하므로 상대 경로면 충분하다(로컬에서 앱별로 다른 포트로 띄울 때는
// 프론트의 VITE_DH_URL/VITE_HR_URL로 오버라이드한다).
export function redirectPathFor(role: Member["role"]): string {
  if (role === "admin") return "/admin";
  if (role === "acting") return "/dh";
  return "/hr";
}
