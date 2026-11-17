import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead } from "@/dh/lib/humanReview/access";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

// 양식의 수정 이력. 최신 버전이 먼저 온다.
export const GET = withListupApiHandler<{ templateId: string }>(async (_req, { member, params }) => {
  requireExternalLead(member);
  const template = await prisma.messageTemplate.findUnique({ where: { id: params.templateId }, select: { id: true } });
  if (!template) throw new ApiError("NOT_FOUND", "양식을 찾지 못했습니다.");
  const versions = await prisma.messageTemplateVersion.findMany({
    where: { templateId: template.id },
    orderBy: { version: "desc" },
    include: { createdBy: { select: { displayName: true } } },
  });
  return {
    body: {
      data: versions.map((row) => ({
        version: row.version,
        subject: row.subject,
        body: row.body,
        aiInstructions: row.aiInstructions as Record<string, string>,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy?.displayName ?? null,
      })),
    },
  };
});
