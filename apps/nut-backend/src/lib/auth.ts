import type { Member } from "@/generated/prisma";
import { createGetAuthenticatedMember, getSupabaseAuthClient } from "@dhbot/auth";
import { ApiError } from "./errors";
import { prisma } from "./prisma";

export const getAuthenticatedMember = createGetAuthenticatedMember<Member>({
  findByEmail: (email) => prisma.member.findUnique({ where: { email } }),
  markLogin: (id, supabaseUserId) => prisma.member.update({ where: { id }, data: { supabaseUserId, lastLoginAt: new Date() } }),
  toError: (code, message) => new ApiError(code as "UNAUTHENTICATED" | "FORBIDDEN", message),
  getSupabaseClient: getSupabaseAuthClient,
  deny: ["alumni"],
  messages: {
    notMember: "이 계정은 NUT 접근 권한이 없습니다. 관리자에게 문의하세요.",
    deniedRole: "NUT는 admin과 acting 계정만 사용할 수 있습니다.",
  },
});
