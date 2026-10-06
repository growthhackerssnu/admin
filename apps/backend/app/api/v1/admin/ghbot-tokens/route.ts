import { randomBytes } from "node:crypto";
import { withApiHandler } from "@/portal/lib/apiHandler";
import { requireAdmin } from "@/portal/lib/auth";
import { ApiError, successBody } from "@/portal/lib/errors";
import { issueGhbotTokenSchema } from "@/portal/lib/validation/admin";
import { prisma } from "@/lib/prisma";
import { encryptGhbotToken, hashGhbotToken } from "@/portal/lib/ghbotTokenCrypto";

function tokenPrefix(token: string) {
  return `${token.slice(0, 10)}…${token.slice(-6)}`;
}

// GET /api/v1/admin/ghbot-tokens — 발급 대상인 활성 acting 회원과 현재 토큰 상태.
// 목록은 원문을 반환하지 않으며, 원문 복사는 토큰별 별도 관리자 요청만 사용한다.
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  requireAdmin(member);
  const members = await prisma.member.findMany({
    where: { role: "acting", active: true },
    orderBy: [{ displayName: "asc" }],  // 기수 순 정렬은 아래에서(기수가 people_directory에 있다)
    include: {
      ghbotTokens: {
        where: { revokedAt: null },
        orderBy: { issuedAt: "desc" },
        take: 1,
      },
      claimedPersonEntry: { select: { cohort: true } },
    },
  });
  return {
    body: successBody(
      {
        // 기수 오름차순, 같은 기수는 이름순. 기수를 모르는 회원은 맨 뒤.
        items: [...members]
          .sort(
            (a, b) =>
              (Number(a.claimedPersonEntry?.cohort) || 999) - (Number(b.claimedPersonEntry?.cohort) || 999) ||
              a.displayName.localeCompare(b.displayName, "ko"),
          )
          .map((target) => {
          const token = target.ghbotTokens[0];
          return {
            memberId: target.id,
            displayName: target.displayName,
            cohort: target.claimedPersonEntry?.cohort ?? null,
            email: target.email,
            token: token
              ? {
                  id: token.id,
                  prefix: token.tokenPrefix,
                  issuedAt: token.issuedAt.toISOString(),
                  lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
                  expiresAt: token.expiresAt?.toISOString() ?? null,
                }
              : null,
          };
        }),
      },
      requestId,
    ),
  };
});

// POST /api/v1/admin/ghbot-tokens — 현재 활성 acting 회원에게 토큰을 발급한다.
// 재발급이면 이전 활성 토큰을 같은 트랜잭션에서 폐기한다. 비밀값을 idempotency
// 응답에 저장하지 않기 위해 이 엔드포인트는 Idempotency-Key를 사용하지 않는다.
export const POST = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);
  const body = await req.json().catch(() => null);
  const parsed = issueGhbotTokenSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "발급 대상을 확인하세요.");

  const rawToken = `ghbot_${randomBytes(32).toString("base64url")}`;
  const created = await prisma.$transaction(async (tx) => {
    const target = await tx.member.findUnique({ where: { id: parsed.data.memberId } });
    if (!target) throw new ApiError("NOT_FOUND", "회원을 찾을 수 없습니다.");
    if (target.role !== "acting" || !target.active) {
      throw new ApiError("FORBIDDEN", "토큰은 활성 acting 회원에게만 발급할 수 있습니다.");
    }
    await tx.ghbotAccessToken.updateMany({
      where: { memberId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.ghbotAccessToken.create({
      data: {
        memberId: target.id,
        tokenHash: hashGhbotToken(rawToken),
        tokenCiphertext: encryptGhbotToken(rawToken),
        tokenPrefix: tokenPrefix(rawToken),
        issuedByMemberId: member.id,
      },
    });
  });

  return {
    body: successBody(
      {
        token: rawToken,
        tokenId: created.id,
        prefix: created.tokenPrefix,
        issuedAt: created.issuedAt.toISOString(),
      },
      requestId,
    ),
  };
});
