import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Member, Prisma } from "@/generated/prisma";
import { prisma } from "./prisma";
import { ApiError } from "./errors";

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

// 모든 POST/PUT/PATCH 업무 변경에 적용한다 (api-contract.md §3).
// 같은 키로 재시도가 오면 새 버전 검사보다 먼저 여기서 이전에 성공한 응답을 그대로
// 재반환한다. 같은 키에 다른 payload가 오면 409. 업무 쓰기 + 키 저장을 한 트랜잭션으로
// 묶어서, 쓰기 성공 후 키 저장 전에 죽어도 재시도가 중복 쓰기를 만들지 않게 한다.
export async function withIdempotency<T>(
  req: NextRequest,
  member: Member,
  route: string,
  payload: unknown,
  handler: (tx: Prisma.TransactionClient) => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T }> {
  const key = req.headers.get("idempotency-key");
  if (!key) {
    throw new ApiError("VALIDATION_ERROR", "Idempotency-Key 헤더가 필요합니다.", {
      fieldErrors: { "Idempotency-Key": "필수" },
    });
  }

  const requestHash = hashPayload(payload);
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ApiError("IDEMPOTENCY_CONFLICT", "같은 키로 다른 요청을 보냈습니다. 새 행동은 새 키를 사용하세요.");
    }
    return { status: existing.responseStatus, body: existing.responseBody as T };
  }

  return prisma.$transaction(async (tx) => {
    const result = await handler(tx);
    await tx.idempotencyKey.create({
      data: {
        key,
        actorMemberId: member.id,
        route,
        requestHash,
        responseStatus: result.status,
        responseBody: result.body as Prisma.InputJsonValue,
      },
    });
    return result;
  });
}
