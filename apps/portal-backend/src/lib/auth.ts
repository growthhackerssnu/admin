import type { Member } from "@/generated/prisma";
import { createGetAuthenticatedMember, getSupabaseAuthClient } from "@dhbot/auth";
import { prisma } from "./prisma";
import { ApiError } from "./errors";

// 인증 정책(검사 순서, 거부 조건, 최근 접속 갱신 시점)은 @dhbot/auth에 한 벌만
// 있다. 여기서는 이 앱에만 해당하는 것 — Prisma 접근, ApiError, 거부 대상 — 만
// 주입한다. 규칙: docs/db/conventions.md §5.2
//
// admin.ghsnu.com 루트 경험(로그인·가입·회원 관리)은 role 전부(admin/acting/
// alumni)를 상대한다 — apps/dh-backend와 달리 alumni를 막지 않는다(deny 없음).
// alumni도 로그인해서 /me로 자기 role을 알아야 어디로 갈지(hr) 정할 수 있고,
// admin 화면의 명단에도 alumni가 나와야 한다.
export const getAuthenticatedMember = createGetAuthenticatedMember<Member>({
  findByEmail: (email) => prisma.member.findUnique({ where: { email } }),
  markLogin: (id, supabaseUserId) =>
    prisma.member.update({ where: { id }, data: { supabaseUserId, lastLoginAt: new Date() } }),
  toError: (code, message) => new ApiError(code, message),
  getSupabaseClient: getSupabaseAuthClient,
  messages: {
    notMember: "이 계정은 admin.ghsnu.com 접근 권한이 없습니다. 관리자에게 문의하세요.",
  },
});

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
