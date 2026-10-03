import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { assertProjectRefs, assertQuarterMatchesSource, httpUrl, projectFields, serializeProject } from "@/dh/lib/projects";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const patchInput = z.object({
  expectedVersion: z.number().int().positive(),
  title: projectFields.title.optional(),
  year: projectFields.year.optional(),
  quarter: projectFields.quarter.optional(),
  status: projectFields.status.optional(),
  summary: projectFields.summary.optional(),
  ownerId: projectFields.ownerId.optional(),
  contactId: projectFields.contactId.optional(),
  resultUrl: projectFields.resultUrl.optional(),
}).strict().refine((value) => Object.keys(value).length >= 2, "수정할 필드가 없습니다.");

// 기업과 수주 출처는 바꾸지 않는다. 과거에 발송한 메시지 본문은 프로젝트 수정과 무관하게 그대로다.
export const PATCH = withListupApiHandler<{ projectId: string }>(async (req, { member, params }) => {
  requireExternalLead(member);
  const parsed = patchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !httpUrl(parsed.data.resultUrl))
    throw new ApiError("VALIDATION_ERROR", "프로젝트 수정 요청이 올바르지 않습니다.");
  const { expectedVersion, ...fields } = parsed.data;
  const exists = await prisma.pastProject.findUnique({ where: { id: params.projectId }, select: { id: true } });
  if (!exists) throw new ApiError("NOT_FOUND", "프로젝트를 찾지 못했습니다.");
  return withIdempotency(req, member, `PATCH /projects/${params.projectId}`, parsed.data, async (tx) => {
    const project = await tx.pastProject.findUniqueOrThrow({
      where: { id: params.projectId },
      include: {
        sourceOutreach: {
          select: { acquisitionRound: { select: { targetQuarter: { select: { year: true, quarter: true } } } } },
        },
      },
    });
    if (project.version !== expectedVersion)
      throw new ApiError("VERSION_CONFLICT", "프로젝트가 변경됐습니다. 다시 조회하세요.");
    if (project.sourceOutreach && (fields.year !== undefined || fields.quarter !== undefined))
      assertQuarterMatchesSource(project.sourceOutreach, fields.year ?? project.year ?? 0, fields.quarter ?? project.quarter ?? 0);
    await assertProjectRefs(tx, project.companyId, fields);
    const changed = await tx.pastProject.updateMany({
      where: { id: project.id, version: expectedVersion },
      data: { ...fields, updatedById: member.id, version: { increment: 1 } },
    });
    if (!changed.count) throw new ApiError("VERSION_CONFLICT", "프로젝트가 변경됐습니다. 다시 조회하세요.");
    const updated = await tx.pastProject.findUniqueOrThrow({ where: { id: project.id } });
    return { status: 200, body: { data: serializeProject(updated) } };
  });
});
