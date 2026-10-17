import { withApiHandler } from "@/portal/lib/apiHandler";
import { requireAdmin } from "@/portal/lib/auth";
import { successBody } from "@/portal/lib/errors";
import { estimateMonthToDateCosts } from "@/portal/lib/costs";

// GET /api/v1/admin/costs — 이번 달 서버(GCP)·LLM(Gemini) 추정 비용.
// 청구서가 아니라 사용량 × 단가 추정이다(src/portal/lib/costs.ts).
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  requireAdmin(member);
  return { body: successBody(await estimateMonthToDateCosts(), requestId) };
});
