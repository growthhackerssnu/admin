import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { withPublicApiHandler } from "@/portal/lib/apiHandler";
import { ApiError, successBody } from "@/portal/lib/errors";
import { assertGhbotSharedSecret } from "@/portal/lib/ghbotSharedSecret";
import { prisma } from "@/lib/prisma";

// ghbot MCP 서버의 OAuth 상태 저장소(ghbot.oauth_entries). OAuth 로직은 ghbot에
// 그대로 두고 여기선 키-값 저장만 한다. ghbot이 키에 원문 토큰 대신 SHA-256을 넣는다.
//   get    — 값 조회(만료됐으면 null)
//   put    — 저장/덮어쓰기
//   take   — 조회와 삭제를 한 번에(인가 코드·리프레시 토큰 1회용 보장)
//   delete — 삭제
const bodySchema = z.object({
  op: z.enum(["get", "put", "take", "delete"]),
  key: z.string().regex(/^(client|code|access|refresh):[A-Za-z0-9_.:-]{1,200}$/),
  data: z.record(z.unknown()).optional(),
  // epoch seconds. null/생략이면 만료 없음.
  expiresAt: z.number().positive().nullable().optional(),
});

function isLive(expiresAt: Date | null) {
  return !expiresAt || expiresAt.getTime() > Date.now();
}

export const POST = withPublicApiHandler(async (req, { requestId }) => {
  assertGhbotSharedSecret(req);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "요청 형식을 확인하세요.");
  const { op, key, data, expiresAt } = parsed.data;

  let value: unknown = null;
  if (op === "get") {
    const row = await prisma.ghbotOauthEntry.findUnique({ where: { key } });
    value = row && isLive(row.expiresAt) ? row.data : null;
  } else if (op === "put") {
    if (!data || JSON.stringify(data).length > 16_384) {
      throw new ApiError("VALIDATION_ERROR", "저장할 값을 확인하세요.");
    }
    const fields = {
      data: data as Prisma.InputJsonObject,
      expiresAt: expiresAt ? new Date(expiresAt * 1000) : null,
    };
    await prisma.ghbotOauthEntry.upsert({ where: { key }, create: { key, ...fields }, update: fields });
    // 만료된 코드·토큰 청소. 행이 몇백 개 수준이라 쓰기 때마다 해도 싸다.
    await prisma.ghbotOauthEntry.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } else if (op === "take") {
    // DELETE ... RETURNING 한 문장이라 같은 코드로 동시에 교환해도 한쪽만 값을 받는다.
    const rows = await prisma.$queryRaw<{ data: unknown; expires_at: Date | null }[]>`
      DELETE FROM "ghbot"."oauth_entries" WHERE "key" = ${key} RETURNING "data", "expires_at"`;
    const row = rows[0];
    value = row && isLive(row.expires_at) ? row.data : null;
  } else {
    await prisma.ghbotOauthEntry.deleteMany({ where: { key } });
  }

  return { body: successBody({ value }, requestId) };
});
