import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { assertProjectRefs, assertQuarterMatchesSource, httpUrl, projectFields, serializeProject } from "@/dh/lib/projects";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const createInput = z.object({
  company: z.union([
    z.object({ id: z.string().min(1) }).strict(),
    z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).optional() }).strict(),
  ]),
  title: projectFields.title,
  year: projectFields.year,
  quarter: projectFields.quarter,
  status: projectFields.status,
  summary: projectFields.summary.optional(),
  ownerId: projectFields.ownerId.optional(),
  contactId: projectFields.contactId.optional(),
  resultUrl: projectFields.resultUrl.optional(),
  sourceOutreachId: z.string().min(1).optional(),
  expectedSourceOutreachVersion: z.number().int().positive().optional(),
}).strict();

const duplicateSource = (projectId: string) =>
  new ApiError("ALREADY_EXISTS", "이 수주 작업에서 이미 프로젝트가 등록됐습니다.", { details: { projectId } });

// 팀장·관리자가 프로젝트를 직접 등록한다. 발송·수주 기록이 없는 과거 프로젝트도 등록할 수 있고,
// 수주 완료 기록이 있다고 완료 프로젝트를 자동으로 만들지는 않는다.
export const POST = withListupApiHandler(async (req, { member }) => {
  requireExternalLead(member);
  const parsed = createInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !httpUrl(parsed.data.resultUrl))
    throw new ApiError("VALIDATION_ERROR", "프로젝트 정보가 올바르지 않습니다.");
  const input = parsed.data;
  if (input.sourceOutreachId && !input.expectedSourceOutreachVersion)
    throw new ApiError("VALIDATION_ERROR", "수주 출처를 쓰려면 expectedSourceOutreachVersion이 필요합니다.", {
      fieldErrors: { expectedSourceOutreachVersion: "필수" },
    });
  try {
    return await withIdempotency(req, member, "POST /projects", input, async (tx) => {
      let companyId: string;
      if ("id" in input.company) {
        const company = await tx.company.findUnique({ where: { id: input.company.id }, select: { id: true } });
        if (!company) throw new ApiError("VALIDATION_ERROR", "기업을 찾지 못했습니다.", { fieldErrors: { company: "없는 기업" } });
        companyId = company.id;
      } else {
        // 이름이 같은 기업을 자동으로 합치지 않는다. 후보를 돌려주고 사람이 고르게 한다.
        const same = await tx.company.findMany({
          where: { name: { equals: input.company.name, mode: "insensitive" } },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
          take: 10,
        });
        if (same.length)
          throw new ApiError("ALREADY_EXISTS", "같은 이름의 기업이 이미 있습니다. 기존 기업을 선택하세요.", {
            details: { candidateCompanyIds: same.map((company) => company.id) },
          });
        companyId = (await tx.company.create({
          data: { name: input.company.name, product: input.company.description ?? null },
        })).id;
      }

      if (input.sourceOutreachId) {
        const source = await tx.outreach.findUnique({
          where: { id: input.sourceOutreachId },
          select: {
            id: true, companyId: true, version: true, outcomeStatus: true,
            acquisitionRound: { select: { targetQuarter: { select: { year: true, quarter: true } } } },
            sourcedProject: { select: { id: true } },
          },
        });
        if (!source) throw new ApiError("VALIDATION_ERROR", "수주 작업을 찾지 못했습니다.", { fieldErrors: { sourceOutreachId: "없는 작업" } });
        if (source.sourcedProject) throw duplicateSource(source.sourcedProject.id);
        if (source.outcomeStatus !== "won")
          throw new ApiError("STATE_CONFLICT", "수주 완료로 기록된 작업만 출처로 쓸 수 있습니다.");
        if (source.companyId !== companyId)
          throw new ApiError("VALIDATION_ERROR", "수주 작업의 기업과 다른 기업입니다.", { fieldErrors: { company: "수주 기업과 다름" } });
        if (source.version !== input.expectedSourceOutreachVersion)
          throw new ApiError("VERSION_CONFLICT", "수주 작업이 변경됐습니다. 다시 조회하세요.");
        assertQuarterMatchesSource(source, input.year, input.quarter);
      }
      await assertProjectRefs(tx, companyId, input);

      const project = await tx.pastProject.create({
        data: {
          companyId,
          title: input.title,
          year: input.year,
          quarter: input.quarter,
          status: input.status,
          summary: input.summary ?? null,
          ownerId: input.ownerId ?? null,
          contactId: input.contactId ?? null,
          resultUrl: input.resultUrl ?? null,
          sourceOutreachId: input.sourceOutreachId ?? null,
          createdById: member.id,
          updatedById: member.id,
        },
      });
      return { status: 201, body: { data: serializeProject(project) } };
    });
  } catch (error) {
    // 같은 수주 작업으로 동시에 두 번 등록하면 늦은 쪽이 unique에 걸린다. 먼저 만든 프로젝트를 알려 준다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && input.sourceOutreachId) {
      const existing = await prisma.pastProject.findUnique({
        where: { sourceOutreachId: input.sourceOutreachId },
        select: { id: true },
      });
      if (existing) throw duplicateSource(existing.id);
    }
    throw error;
  }
});
