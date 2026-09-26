import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { assertRevisionMatch } from "@/lib/revision";
import { exclusionSchema } from "@/lib/validation/outreach";

// POST /companies/{companyId}/exclusion — 영구 제외. 자동 복귀 없음(§6 확정
// 정책). repeat_collaboration 경로는 제외 사유가 필수. 회사·컨택 건 둘 다 버전
// 검사 후 함께 갱신한다 — 제외 복구(un-exclude) API는 정책 미정이라 만들지 않는다.
export const POST = withApiHandler<{ companyId: string }>(async (req, { member, params }) => {
  const body = await req.json().catch(() => null);
  const parsed = exclusionSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.");
  const {
    expectedCompanyVersion,
    outreachId,
    expectedVersion,
    note,
  } = parsed.data;

  return withIdempotency(req, member, "POST /companies/:id/exclusion", parsed.data, async (tx) => {
    const [company, outreach] = await Promise.all([
      tx.company.findUnique({ where: { id: params.companyId } }),
      tx.outreach.findUnique({ where: { id: outreachId } }),
    ]);
    assertRevisionMatch(company, company?.version, expectedCompanyVersion);
    assertRevisionMatch(outreach, outreach?.version, expectedVersion);
    if (outreach.companyId !== params.companyId) {
      throw new ApiError("VALIDATION_ERROR", "컨택 건이 이 기업에 속하지 않습니다.");
    }
    if (outreach.route === "repeat_collaboration" && !note?.trim()) {
      throw new ApiError("VALIDATION_ERROR", "재협업을 진행하지 않는 사유가 필요합니다.", {
        fieldErrors: { note: "필수" },
      });
    }

    const companyUpdate = await tx.company.updateMany({
      where: { id: params.companyId, version: expectedCompanyVersion },
      data: {
        permanentlyExcluded: true,
        permanentlyExcludedReason: note,
        permanentlyExcludedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (companyUpdate.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    const outreachUpdate = await tx.outreach.updateMany({
      where: { id: outreachId, version: expectedVersion },
      data: {
        internalDecision: "excluded_permanently",
        decidedById: member.id,
        decidedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (outreachUpdate.count !== 1) {
      throw new ApiError("VERSION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
    }

    const [updatedCompany, updatedOutreach] = await Promise.all([
      tx.company.findUnique({ where: { id: params.companyId } }),
      tx.outreach.findUnique({ where: { id: outreachId } }),
    ]);

    return {
      status: 200,
      body: successBody({
        company: {
          id: updatedCompany!.id,
          version: updatedCompany!.version,
          permanentlyExcluded: updatedCompany!.permanentlyExcluded,
          permanentlyExcludedReason: updatedCompany!.permanentlyExcludedReason,
        },
        outreach: {
          id: updatedOutreach!.id,
          version: updatedOutreach!.version,
          internalDecision: updatedOutreach!.internalDecision,
        },
      }),
    };
  });
});
