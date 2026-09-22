import { withPublicApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hashOtp, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { verifySignupRequestSchema } from "@/lib/validation/auth";

// POST /api/auth/signup-requests/{id}/verify
// OTP 확인 -> 성공하면 desiredEmail로 members 행 생성(role은 people_directory.status
// 를 따름), people_directory.claimedByMemberId 기록. 이후 그 이메일로 Google 로그인.
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
    const created = await tx.member.upsert({
      where: { email: signupRequest.desiredEmail },
      update: { displayName: person.name, role: person.status, active: true },
      create: { email: signupRequest.desiredEmail, displayName: person.name, role: person.status, active: true },
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
