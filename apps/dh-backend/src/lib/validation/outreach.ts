import { z } from "zod";

// 요청 본문의 키는 명세 규약대로 snake_case다. DB 컬럼 이름(version 등)과는 무관하며,
// 전환은 wire 레벨에서만 일어난다.

export const approvalSchema = z.object({
  expected_version: z.number().int(),
  review_note: z.string().trim().optional(),
  condition_evidence: z.string().trim().optional(),
});

export const skipSchema = z.object({
  expected_version: z.number().int(),
  quarter_id: z.string().min(1),
  note: z.string().trim().optional(),
});

export const exclusionSchema = z.object({
  expected_company_version: z.number().int(),
  outreach_id: z.string().min(1),
  expected_version: z.number().int(),
  note: z.string().trim().optional(),
});

export const selectRecipientSchema = z.object({
  expected_version: z.number().int(),
  contact_id: z.string().min(1),
  endpoint_id: z.string().min(1),
});

export const recipientReviewSchema = z.object({
  expected_version: z.number().int(),
});

export const saveDraftSchema = z.object({
  expected_version: z.number().int(),
  expected_revision: z.number().int(),
  topic: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

export const approveDraftSchema = z.object({
  expected_version: z.number().int(),
  expected_revision: z.number().int(),
});

export const draftReviewSchema = z.object({
  expected_version: z.number().int(),
  draft_id: z.string().min(1),
});

export const RESPONSE_RESULTS = ["no_reply", "discussing", "rejected", "deferred", "referred", "closed"] as const;
export const RESPONSE_CATEGORIES = ["resource_shortage", "not_interested", "no_problem_demand", "other"] as const;

export const responseCheckSchema = z
  .object({
    expected_version: z.number().int(),
    send_id: z.string().min(1).optional(),
    result: z.enum(RESPONSE_RESULTS),
    category: z.enum(RESPONSE_CATEGORIES).optional(),
    note: z.string().trim().optional(),
    revisit_condition: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (["rejected", "deferred"].includes(data.result) && !data.category) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "거절·보류는 사유 카테고리가 필수입니다." });
    }
    if (data.category === "other" && !data.note?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "'기타' 사유는 설명이 필수입니다." });
    }
  });
