import { z } from "zod";

// admin으로의 승격/강등은 이 API로 하지 않는다 — 수동(CLI/직접 DB)으로만.
export const bulkRoleChangeSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1, "최소 한 명은 선택해야 합니다."),
  role: z.enum(["acting", "alumni"]),
});

export const bulkDeactivateSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1, "최소 한 명은 선택해야 합니다."),
});
