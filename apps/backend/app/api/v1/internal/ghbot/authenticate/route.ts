import { withPublicApiHandler } from "@/portal/lib/apiHandler";
import { ApiError, successBody } from "@/portal/lib/errors";
import { hashGhbotToken } from "@/portal/lib/ghbotTokenCrypto";
import { assertGhbotSharedSecret } from "@/portal/lib/ghbotSharedSecret";
import { prisma } from "@/lib/prisma";

// ghbot MCP 서버 전용 토큰 검증 API. Supabase DB 접속 정보는 ghbot에 전달하지
// 않고, 공유 비밀값을 가진 서버만 토큰 해시 대조를 요청할 수 있다.
export const POST = withPublicApiHandler(async (req, { requestId }) => {
  assertGhbotSharedSecret(req);

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : null;
  const tokenHash = typeof body?.tokenHash === "string" ? body.tokenHash : null;
  if ((token === null) === (tokenHash === null) || (tokenHash && !/^[a-f0-9]{64}$/.test(tokenHash))) {
    throw new ApiError("VALIDATION_ERROR", "토큰을 확인하세요.");
  }

  const resolvedHash = tokenHash ?? hashGhbotToken(token!);
  const accessToken = await prisma.ghbotAccessToken.findFirst({
    where: { tokenHash: resolvedHash, revokedAt: null, member: { is: { role: "acting", active: true } } },
    include: { member: { select: { id: true, displayName: true } } },
  });
  if (!accessToken) throw new ApiError("UNAUTHENTICATED", "인증할 수 없습니다.");

  return {
    body: successBody(
      { memberId: accessToken.member.id, displayName: accessToken.member.displayName },
      requestId,
    ),
  };
});
