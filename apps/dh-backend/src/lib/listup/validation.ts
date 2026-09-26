import { z } from "zod";

// 리스트업 요청 본문 스키마. 키는 전부 camelCase이고(v0.3 §7.1), 명세가 "모두 필수"라고
// 적은 필드는 생략을 허용하지 않는다.

export const sourceConfigSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  entryUrls: z.array(z.string().url()),
  query: z.string().trim().min(1).nullable(),
});

export const searchFiltersSchema = z.object({
  industries: z.array(z.string().trim().min(1)),
  keywords: z.array(z.string().trim().min(1)),
  regions: z.array(z.string().trim().min(1)),
  companyStages: z.array(z.string().trim().min(1)),
  excludedCompanyIds: z.array(z.string().min(1)),
  additionalConditions: z.string().trim().min(1).nullable(),
});

export const searchLimitsSchema = z.object({
  maxCompanies: z.number().int().min(1),
  maxFitFollowupRounds: z.number().int().min(0),
  maxContactSearchRounds: z.number().int().min(1),
});

export const createSearchRunSchema = z
  .object({
    quarterId: z.string().min(1),
    sourcePolicy: z.enum(["selected_only", "allow_supplementary"]),
    sources: z.array(sourceConfigSchema).min(1),
    filters: searchFiltersSchema,
    limits: searchLimitsSchema,
  })
  .superRefine((data, ctx) => {
    const keys = data.sources.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sources"],
        message: "소스 key는 실행 안에서 고유해야 합니다.",
      });
    }
  });

export const FIT_VERDICTS = ["fit", "unfit", "pending"] as const;

export const humanFitDecisionSchema = z.object({
  expectedRevision: z.number().int(),
  verdict: z.enum(FIT_VERDICTS),
  reason: z.string().trim().min(1).nullable().optional(),
  interventionNote: z.string().trim().min(1).nullable().optional(),
  basedOnAssessmentId: z.string().min(1).nullable().optional(),
});

// companyResearch는 모든 fit 상태에서 가능하고, 연락 계열은 fit일 때만 가능하다.
export const RESEARCH_REQUEST_TYPES = [
  "company_research",
  "contact_research",
  "contact_verification",
] as const;

export const researchRequestSchema = z.object({
  type: z.enum(RESEARCH_REQUEST_TYPES),
  requestedInformation: z.array(z.string().trim().min(1)).min(1),
});
