import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { serializeCompanyResearch } from "@/lib/listup/serializers";
import { prisma } from "@/lib/prisma";

// GET /company-research/{id} — 특정 기업 조사 버전.
// 과거 판단이 참조하는 research_id를 그대로 열어볼 수 있게 하는 경로다.
export const GET = withApiHandler<{ researchId: string }>(async (_req, { params }) => {
  const research = await prisma.companyResearch.findUnique({
    where: { id: params.researchId },
    include: { claims: { orderBy: { id: "asc" } } },
  });
  if (!research) throw new ApiError("NOT_FOUND", "기업 조사를 찾을 수 없습니다.");

  return { body: successBody(serializeCompanyResearch(research)) };
});
