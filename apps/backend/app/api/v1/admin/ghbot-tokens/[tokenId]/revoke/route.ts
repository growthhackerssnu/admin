import { withApiHandler } from "@/portal/lib/apiHandler";
import { requireAdmin } from "@/portal/lib/auth";
import { ApiError, successBody } from "@/portal/lib/errors";
import { withIdempotency } from "@/portal/lib/idempotency";

// POST /api/v1/admin/ghbot-tokens/:tokenId/revoke — 토큰은 삭제하지 않고 회수
// 이력을 남긴다. 재발급도 이 API와 같은 revoked_at 의미를 사용한다.
export const POST = withApiHandler<{ tokenId: string }>(async (req, { member, requestId, params }) => {
  requireAdmin(member);
  const result = await withIdempotency(req, member, "POST /admin/ghbot-tokens/:tokenId/revoke", { tokenId: params.tokenId }, async (tx) => {
    const token = await tx.ghbotAccessToken.findUnique({ where: { id: params.tokenId } });
    if (!token) throw new ApiError("NOT_FOUND", "토큰을 찾을 수 없습니다.");
    if (token.revokedAt) {
      return { status: 200, body: successBody({ id: token.id, revokedAt: token.revokedAt.toISOString() }, requestId) };
    }
    const revokedAt = new Date();
    await tx.ghbotAccessToken.update({ where: { id: token.id }, data: { revokedAt } });
    return { status: 200, body: successBody({ id: token.id, revokedAt: revokedAt.toISOString() }, requestId) };
  });
  return result;
});
