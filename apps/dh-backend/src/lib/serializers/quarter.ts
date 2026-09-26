import type { Member, Quarter } from "@/generated/prisma";

type QuarterWithCreator = Quarter & {
  createdBy: Pick<Member, "id" | "displayName">;
};

export function serializeQuarter(quarter: QuarterWithCreator) {
  return {
    id: quarter.id,
    label: quarter.label,
    active: quarter.active,
    created_at: quarter.createdAt.toISOString(),
    closed_at: quarter.closedAt?.toISOString() ?? null,
    created_by: { id: quarter.createdBy.id, display_name: quarter.createdBy.displayName },
  };
}

export const quarterCreatorSelect = { select: { id: true, displayName: true } } as const;
