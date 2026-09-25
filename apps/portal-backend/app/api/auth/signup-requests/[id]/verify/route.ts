import { withPublicApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hashOtp, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { verifySignupRequestSchema } from "@/lib/validation/auth";

// POST /api/auth/signup-requests/{id}/verify
// OTP 확인 -> 성공하면 desiredEmail로 members 행 생성(role은 항상 alumni로 시작 —
// admin이 admin.ghsnu.com/admin에서 개별로 acting 승격), people_directory에
// claimedByMemberId 기록. 이후 그 이메일로 Google 로그인.
export const POST = withPublicApiHandler<{ id: string }>(async (req, { params, requestId }) => {
  const body = await req.json().catch(() => null);
  const parsed = verifySignupRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "6자리 코드를 입력하세요.");
  }

  const signupRequest = await prisma.signupRequest.findUnique({
    where: { id: params.id },
    include: { personDirectory: true },
  });
  if (!signupRequest) {
    throw new ApiError("NOT_FOUND", "가입 신청을 찾을 수 없습니다.");
  }
  if (signupRequest.status === "verified") {
    throw new ApiError("VALIDATION_ERROR", "이미 인증이 완료됐습니다.");
  }
  if (signupRequest.status === "expired" || signupRequest.otpExpiresAt < new Date()) {
    if (signupRequest.status !== "expired") {
      await prisma.signupRequest.update({ where: { id: signupRequest.id }, data: { status: "expired" } });
    }
    throw new ApiError("VALIDATION_ERROR", "인증 코드가 만료됐습니다. 다시 신청해주세요.");
  }
  if (signupRequest.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.signupRequest.update({ where: { id: signupRequest.id }, data: { status: "expired" } });
    throw new ApiError("VALIDATION_ERROR", "시도 횟수를 초과했습니다. 다시 신청해주세요.");
  }

  if (hashOtp(parsed.data.otp) !== signupRequest.otpHash) {
    const attempts = signupRequest.attempts + 1;
    await prisma.signupRequest.update({ where: { id: signupRequest.id }, data: { attempts } });
    throw new ApiError(
      "VALIDATION_ERROR",
      `인증 코드가 올바르지 않습니다. (${OTP_MAX_ATTEMPTS - attempts}회 남음)`,
    );
  }

  const person = signupRequest.personDirectory;
  if (person.claimedByMemberId) {
    throw new ApiError("VALIDATION_ERROR", "이미 가입이 완료된 회원입니다. 로그인해주세요.");
  }

  const member = await prisma.$transaction(async (tx) => {
    // upsert가 아니라 create다 — desiredEmail이 이미 members에 있으면(위에서
    // 걸렀어야 하지만 경합 상황 대비) role을 조용히 덮어쓰지 않고 그냥 실패한다.
    const created = await tx.member.create({
      data: { email: signupRequest.desiredEmail, displayName: person.name, role: "alumni", active: true },
    });
    await tx.peopleDirectory.update({
      where: { id: person.id },
      data: { claimedByMemberId: created.id, claimedAt: new Date() },
    });
    await tx.signupRequest.update({
      where: { id: signupRequest.id },
      data: { status: "verified", verifiedAt: new Date() },
    });
    return created;
  });

  return {
    body: successBody(
      { memberId: member.id, email: member.email, role: member.role, displayName: member.displayName },
      requestId,
    ),
  };
});
