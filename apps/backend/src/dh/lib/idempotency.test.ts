import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/generated/prisma";
import type { ApiError } from "./errors";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dhIdempotencyKey: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { withIdempotency } from "./idempotency";
import { prisma } from "@/lib/prisma";

const findUnique = vi.mocked(prisma.dhIdempotencyKey.findUnique);

const ROUTE = "POST /candidates/:id/human-fit-decisions";
const PAYLOAD = { verdict: "fit" };
const hashOf = (payload: unknown) =>
  createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");

const member = { id: "m1" } as Member;
const requestWithKey = (key: string | null) =>
  ({
    headers: { get: (name: string) => (name === "idempotency-key" ? key : null) },
  }) as unknown as NextRequest;

async function codeOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (err) {
    return (err as ApiError).code;
  }
  return "NO_ERROR";
}

const storedRow = (overrides: Partial<{ actorMemberId: string; route: string; requestHash: string }> = {}) => ({
  actorMemberId: member.id,
  route: ROUTE,
  requestHash: hashOf(PAYLOAD),
  responseStatus: 201,
  responseBody: { data: { id: "d1" } },
  ...overrides,
});

describe("withIdempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Idempotency-Key 헤더가 없으면 VALIDATION_ERROR(422)", async () => {
    const code = await codeOf(
      withIdempotency(requestWithKey(null), member, ROUTE, PAYLOAD, async () => {
        throw new Error("호출되면 안 된다");
      }),
    );
    expect(code).toBe("VALIDATION_ERROR");
  });

  it("같은 키·경로·본문이면 저장된 응답을 그대로 재생하고 핸들러를 부르지 않는다", async () => {
    findUnique.mockResolvedValue(storedRow() as never);
    const handler = vi.fn();

    const result = await withIdempotency(requestWithKey("k1"), member, ROUTE, PAYLOAD, handler);

    expect(result).toEqual({ status: 201, body: { data: { id: "d1" } } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("같은 키가 다른 경로로 오면 IDEMPOTENCY_CONFLICT", async () => {
    findUnique.mockResolvedValue(storedRow({ route: "POST /search-runs" }) as never);

    const code = await codeOf(
      withIdempotency(requestWithKey("k1"), member, ROUTE, PAYLOAD, async () => {
        throw new Error("호출되면 안 된다");
      }),
    );
    expect(code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("다른 사용자가 같은 키를 보내면 이전 응답을 재생하지 않는다", async () => {
    findUnique.mockResolvedValue(storedRow({ actorMemberId: "other-member" }) as never);

    const code = await codeOf(
      withIdempotency(requestWithKey("k1"), member, ROUTE, PAYLOAD, async () => {
        throw new Error("호출되면 안 된다");
      }),
    );
    expect(code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("같은 키에 다른 본문이 오면 IDEMPOTENCY_CONFLICT", async () => {
    findUnique.mockResolvedValue(storedRow({ requestHash: hashOf({ verdict: "unfit" }) }) as never);

    const code = await codeOf(
      withIdempotency(requestWithKey("k1"), member, ROUTE, PAYLOAD, async () => {
        throw new Error("호출되면 안 된다");
      }),
    );
    expect(code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("긴 작업에 지정한 트랜잭션 제한 시간을 Prisma에 전달한다", async () => {
    findUnique.mockResolvedValue(null);
    const result = { status: 201, body: { data: { id: "d1" } } };
    vi.mocked(prisma.$transaction).mockResolvedValue(result as never);
    const options = { maxWait: 10_000, timeout: 15_000 };

    await expect(withIdempotency(
      requestWithKey("k1"), member, ROUTE, PAYLOAD,
      async () => result,
      options,
    )).resolves.toEqual(result);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), options);
  });
});
