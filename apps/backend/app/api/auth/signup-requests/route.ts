import { withPublicApiHandler } from "@/portal/lib/apiHandler";
import { ApiError, successBody } from "@/portal/lib/errors";
import { prisma } from "@/lib/prisma";
import { normalizeCohort, normalizeName } from "@/portal/lib/normalize";
import { generateOtp, hashOtp, maskEmail, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "@/portal/lib/otp";
import { sendOtpEmail } from "@/portal/lib/resend";
import { syncPeopleDirectory } from "@/portal/lib/peopleDirectorySync";
import { signupRequestSchema } from "@/portal/lib/validation/auth";

const DIRECTORY_SYNC_COOLDOWN_MS = 60_000;
let lastDirectorySyncAt = 0;

// POST /api/auth/signup-requests
// 기수+이름+원하는 구글 이메일 -> people_directory에서 대조 -> 매칭되면 그
// 사람의 노션 신뢰 이메일로 OTP 발송. 로그인 전 흐름이라 인증을 요구하지 않는다.
export const POST = withPublicApiHandler(async (req, { requestId }) => {
  const body = await req.json().catch(() => null);
  const parsed = signupRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
      fieldErrors: Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""]),
      ),
    });
  }
  const { cohort, name, desiredEmail } = parsed.data;

  const where = { cohortNormalized: normalizeCohort(cohort), nameNormalized: normalizeName(name) };
  let matches = await prisma.peopleDirectory.findMany({ where });

  // 명단에 없으면 노션이 더 최신일 수 있다(새 기수 추가 직후 등). 노션에서
  // 동기화한 뒤 한 번 더 찾는다. 공개 엔드포인트라 오타마다 노션을 긁지 않게
  // 인스턴스당 1분에 한 번만.
  // ponytail: in-memory throttle, 인스턴스가 여러 개면 인스턴스마다 따로 센다.
  if (matches.length === 0 && Date.now() - lastDirectorySyncAt > DIRECTORY_SYNC_COOLDOWN_MS) {
    lastDirectorySyncAt = Date.now();
    try {
      await syncPeopleDirectory();
      matches = await prisma.peopleDirectory.findMany({ where });
    } catch (error) {
      console.error(`[${requestId}] people_directory sync failed`, error);
    }
  }

  if (matches.length === 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "일치하는 명단을 찾을 수 없습니다. 기수·이름을 다시 확인하거나 운영진에게 문의하세요.",
    );
  }
  if (matches.length > 1) {
    throw new ApiError("VALIDATION_ERROR", "일치하는 항목이 여러 건입니다. 운영진에게 문의하세요.");
  }
  const person = matches[0]!;

  if (person.claimedByMemberId) {
    throw new ApiError("VALIDATION_ERROR", "이미 가입이 완료된 회원입니다. 로그인해주세요.");
  }

  const existingEmail = await prisma.member.findUnique({ where: { email: desiredEmail } });
  if (existingEmail) {
    throw new ApiError("VALIDATION_ERROR", "이미 다른 계정에서 사용 중인 이메일입니다.");
  }

  const recent = await prisma.signupRequest.findFirst({
    where: { personDirectoryId: person.id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new ApiError("RATE_LIMITED", "잠시 후 다시 시도해주세요.");
  }

  // 이전 대기 중인 요청은 만료 처리 — 사람당 유효한 요청은 항상 하나만.
  await prisma.signupRequest.updateMany({
    where: { personDirectoryId: person.id, status: "pending" },
    data: { status: "expired" },
  });

  const otp = generateOtp();
  const signupRequest = await prisma.signupRequest.create({
    data: {
      personDirectoryId: person.id,
      desiredEmail,
      otpHash: hashOtp(otp),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  try {
    await sendOtpEmail({ to: person.knownEmail, name: person.name, otp, desiredEmail });
  } catch (error) {
    // 메일이 안 나갔으면 이 요청은 쓸 수 없다. 만료 처리해야 재시도가 쿨다운에 막히지 않는다.
    await prisma.signupRequest.update({
      where: { id: signupRequest.id },
      data: { status: "expired" },
    });
    console.error(`[${requestId}]`, error);
    throw new ApiError(
      "INTERNAL_ERROR",
      "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도하거나 운영진에게 문의하세요.",
      { retryable: true },
    );
  }

  return {
    status: 201,
    body: successBody(
      {
        signupRequestId: signupRequest.id,
        sentTo: maskEmail(person.knownEmail),
        expiresAt: signupRequest.otpExpiresAt.toISOString(),
      },
      requestId,
    ),
  };
});
