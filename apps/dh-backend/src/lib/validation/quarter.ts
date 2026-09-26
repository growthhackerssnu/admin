import { z } from "zod";

// 라벨은 담당자가 정하지만 형식은 고정한다. 프론트가 쓰는 표기(2026-Q4)와 어긋난
// 값이 섞이면 분기별 묶음이 조용히 갈라진다.
export const QUARTER_LABEL_PATTERN = /^\d{4}-Q[1-4]$/;

export const createQuarterSchema = z.object({
  label: z.string().trim().regex(QUARTER_LABEL_PATTERN, "분기 라벨은 2026-Q4 형식이어야 합니다."),
});

export const updateQuarterSchema = z.object({
  active: z.boolean(),
});
