import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead, requireExternalReader } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const patchBody = z.object({ expectedVersion: z.number().int().positive(), paused: z.boolean() }).strict();

function serializeIntake(row: {
  paused: boolean;
  version: number;
  changedAt: Date;
  changedBy: { id: string; displayName: string } | null;
}) {
  return {
    paused: row.paused,
    version: row.version,
    changedAt: row.changedAt.toISOString(),
    changedBy: row.changedBy
      ? { id: row.changedBy.id, name: row.changedBy.displayName }
      : null,
  };
}

export const GET = withListupApiHandler(async (_req, { member }) => {
  requireExternalReader(member);
  const row = await prisma.collectionIntakeControl.findUnique({
    where: { id: "dh" },
    include: { changedBy: true },
  });
  if (!row) throw new ApiError("SERVICE_UNAVAILABLE", "수집 설정을 찾지 못했습니다. 마이그레이션을 확인하세요.");
  return { body: { data: serializeIntake(row) } };
});

export const PATCH = withListupApiHandler(async (req, { member }) => {
  requireExternalLead(member);
  const parsed = patchBody.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "수집 설정 요청이 올바르지 않습니다.");
  return withIdempotency(req, member, "/collection-intake", parsed.data, async (tx) => {
    const changed = await tx.collectionIntakeControl.updateMany({
      where: { id: "dh", version: parsed.data.expectedVersion },
      data: {
        paused: parsed.data.paused,
        version: { increment: 1 },
        changedById: member.id,
        changedAt: new Date(),
      },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "수집 설정이 변경됐습니다. 다시 조회하세요.");
    const row = await tx.collectionIntakeControl.findUniqueOrThrow({
      where: { id: "dh" },
      include: { changedBy: true },
    });
    return { status: 200, body: { data: serializeIntake(row) } };
  });
});
