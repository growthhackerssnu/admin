import { withApiHandler } from "@/portal/lib/apiHandler";
import { requireAdmin } from "@/portal/lib/auth";
import { decryptGhbotToken } from "@/portal/lib/ghbotTokenCrypto";
import { ApiError, successBody } from "@/portal/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /api/v1/admin/ghbot-tokens/:tokenId/secret
// 목록은 마스킹된 접두사만 보내며, 실제 원문은 관리자가 명시적으로 복사할 때만
// 이 요청으로 복호화한다. 회수된 토큰은 다시 꺼낼 수 없다.
export const GET = withApiHandler<{ tokenId: string }>(async (_req, { member, requestId, params }) => {
  requireAdmin(member);
  const token = await prisma.ghbotAccessToken.findUnique({ where: { id: params.tokenId } });
  if (!token || token.revokedAt) throw new ApiError("NOT_FOUND", "활성 토큰을 찾을 수 없습니다.");

  return {
    body: successBody({ token: decryptGhbotToken(token.tokenCiphertext) }, requestId),
  };
});
