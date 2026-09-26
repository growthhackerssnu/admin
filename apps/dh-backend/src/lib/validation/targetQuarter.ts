import { z } from "zod";

// v0.4 §6.4: `{ "year": 2026, "quarter": 4 }`. 분기 생성이 탐색이나 Cycle을
// 자동 생성하지 않는다.
export const createTargetQuarterSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});
