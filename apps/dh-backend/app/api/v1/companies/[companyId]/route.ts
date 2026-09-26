import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { serializeCompany } from "@/lib/serializers/company";

// GET /companies/{id} — 명세 §6.7의 기업 식별 정보 조회.
// 예전에 여기서 같이 내려주던 발송용 필드(product·제외 플래그·과거 협업 등)는
// GET /outreaches/{id}의 company 하위 객체로 옮겼다.
export const GET = withApiHandler<{ companyId: string }>(async (_req, { params }) => {
  const company = await prisma.company.findUnique({ where: { id: params.companyId } });
  if (!company) throw new ApiError("NOT_FOUND", "기업을 찾을 수 없습니다.");

  return { body: successBody(serializeCompany(company)) };
});
