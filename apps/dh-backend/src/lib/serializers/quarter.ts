import type { Member, Quarter } from "@/generated/prisma";

type QuarterWithCreator = Quarter & {
  createdBy: Pick<Member, "id" | "displayName">;
};

export function serializeQuarter(quarter: QuarterWithCreator) {
  return {
    id: quarter.id,
    label: quarter.label,
    active: quarter.active,
    createdAt: quarter.createdAt.toISOString(),
    closedAt: quarter.closedAt?.toISOString() ?? null,
    createdBy: { id: quarter.createdBy.id, displayName: quarter.createdBy.displayName },
  };
}

export const quarterCreatorSelect = { select: { id: true, displayName: true } } as const;
