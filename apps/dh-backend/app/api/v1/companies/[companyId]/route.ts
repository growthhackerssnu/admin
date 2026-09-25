import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// #05 GET /companies/{companyId}
export const GET = withApiHandler<{ companyId: string }>(async (_req, { params, requestId }) => {
  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    include: {
      pastProjects: true,
      outreaches: { select: { id: true } },
    },
  });
  if (!company) throw new ApiError("NOT_FOUND", "기업을 찾을 수 없습니다.");

  return {
    body: successBody(
      {
        id: company.id,
        name: company.name,
        product: company.product,
        domain: company.domain,
        companyVersion: company.version,
        permanentlyExcluded: company.permanentlyExcluded,
        permanentlyExcludedReason: company.permanentlyExcludedReason,
        isPrelaunchOnly: company.isPrelaunchOnly,
        outreachId: company.outreaches[0]?.id ?? null,
        pastProjects: company.pastProjects.map((p) => ({
          id: p.id,
          title: p.title,
          summary: p.summary,
          notionUrl: p.notionUrl,
        })),
      },
      requestId,
    ),
  };
});
