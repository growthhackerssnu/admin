import { z } from "zod";

// 요청 본문의 키는 camelCase다(v0.3 §7.1). DB 컬럼 이름과는 무관하며 변환은
// Prisma가 맡는다.

export const approvalSchema = z.object({
  expectedVersion: z.number().int(),
  reviewNote: z.string().trim().optional(),
  conditionEvidence: z.string().trim().optional(),
});

export const skipSchema = z.object({
  expectedVersion: z.number().int(),
  quarterId: z.string().min(1),
  note: z.string().trim().optional(),
});

export const exclusionSchema = z.object({
  expectedCompanyVersion: z.number().int(),
  outreachId: z.string().min(1),
  expectedVersion: z.number().int(),
  note: z.string().trim().optional(),
});

export const selectRecipientSchema = z.object({
  expectedVersion: z.number().int(),
  contactId: z.string().min(1),
  endpointId: z.string().min(1),
});

export const startOutreachSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export const generateDraftSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const recipientReviewSchema = z.object({
  expectedVersion: z.number().int(),
});

export const saveDraftSchema = z.object({
  expectedVersion: z.number().int(),
  expectedRevision: z.number().int(),
  topic: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

export const approveDraftSchema = z.object({
  expectedVersion: z.number().int(),
  expectedRevision: z.number().int(),
});

export const draftReviewSchema = z.object({
  expectedVersion: z.number().int(),
  draftId: z.string().min(1),
});

export const RESPONSE_RESULTS = [
  "no_reply",
  "discussing",
  "rejected",
  "deferred",
  "referred",
  "closed",
] as const;
export const RESPONSE_CATEGORIES = [
  "resource_shortage",
  "not_interested",
  "no_problem_demand",
  "other",
] as const;

export const responseCheckSchema = z
  .object({
    expectedVersion: z.number().int(),
    sendId: z.string().min(1).optional(),
    result: z.enum(RESPONSE_RESULTS),
    category: z.enum(RESPONSE_CATEGORIES).optional(),
    note: z.string().trim().optional(),
    revisitCondition: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (["rejected", "deferred"].includes(data.result) && !data.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "거절·보류는 사유 카테고리가 필수입니다.",
      });
    }
    if (data.category === "other" && !data.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "'기타' 사유는 설명이 필수입니다.",
      });
    }
  });
