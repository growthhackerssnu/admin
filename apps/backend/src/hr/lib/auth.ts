import type { Member } from "@/generated/prisma";
import { createGetAuthenticatedMember, getSupabaseAuthClient } from "@dhbot/auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "./errors";

// 인증 정책(검사 순서, 거부 조건, 최근 접속 갱신 시점)은 @dhbot/auth에 한 벌만
// 있다. 여기서는 이 앱에만 해당하는 것 — Prisma 접근, ApiError, 거부 대상 — 만
// 주입한다. 규칙: docs/db/conventions.md §5.2
//
// hr(그핵드인)은 alumni가 주 사용자이므로 role을 막지 않는다(deny 없음).
// alumni에게 보기 전용으로 제한할지 같은 세부 권한은 아직 정해지지 않았다 —
// 정해지면 여기에 deny를 넣거나, 라우트에서 member.role을 보고 나눈다.
// 승인 큐 권한은 §8에서 admin만으로 확정됐다(acting도 안 됨) — 인증 계층의
// deny 목록이 아니라 라우트 안에서 개별적으로 체크한다(hr은 role 자체를
// 막지 않으므로).
export function requireAdmin(member: Member): void {
  if (member.role !== "admin") {
    throw new ApiError("FORBIDDEN", "관리자만 접근할 수 있습니다.");
  }
}

export const getAuthenticatedMember = createGetAuthenticatedMember<Member>({
  findByEmail: (email) => prisma.member.findUnique({ where: { email } }),
  markLogin: (id, supabaseUserId) =>
    prisma.member.update({ where: { id }, data: { supabaseUserId, lastLoginAt: new Date() } }),
  toError: (code, message) => new ApiError(code, message),
  getSupabaseClient: getSupabaseAuthClient,
  messages: {
    notMember: "이 계정은 그핵드인 접근 권한이 없습니다. 관리자에게 문의하세요.",
  },
});
