import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { withIdempotency } from "@/dh/lib/idempotency";
import { requireExpectedRound } from "@/dh/lib/rounds";
import { ApiError } from "@/dh/lib/errors";
import { prisma } from "@/lib/prisma";

const startInput = z.object({
  expectedRoundId: z.string().min(1),
  previousOutreachId: z.string().min(1).optional(),
  entryPoint: z.enum(["contact_history", "collaboration_history"]).default("contact_history"),
}).strict();

// "메시지 작성"을 누르면 현재 회차의 기업 작업을 만들거나, 이미 있으면 그대로 돌려준다.
// 후보·승인 이력은 만들지 않는다. 기존 작업의 담당자는 바꾸지 않는다.
export const POST = withListupApiHandler<{ companyId: string }>(async (req, { member, params }) => {
  requireExternalReader(member);
  const parsed = startInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "메시지 작성 요청이 올바르지 않습니다.");
  const input = parsed.data;
  const route = `POST /companies/${params.companyId}/outreaches`;
  try {
    return await withIdempotency(req, member, route, input, async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: params.companyId },
        select: { id: true, permanentlyExcluded: true },
      });
      if (!company) throw new ApiError("NOT_FOUND", "기업을 찾지 못했습니다.");
      const round = await requireExpectedRound(tx, input.expectedRoundId);
      const existing = await tx.outreach.findFirst({
        where: { companyId: company.id, acquisitionRoundId: round.id },
        select: { id: true },
      });
      if (existing)
        return { status: 200, body: { data: await getHumanOutreachDetail(tx, existing.id, member) } };
      if (company.permanentlyExcluded)
        throw new ApiError("CONTACT_EXCLUDED", "영구 제외된 기업은 연락 작업을 만들 수 없습니다.");

      const [lastSent, won, project] = await Promise.all([
        tx.sentMessage.findFirst({
          where: { outreach: { companyId: company.id } },
          orderBy: [{ sentAt: "desc" }, { id: "desc" }],
          select: { outreachId: true },
        }),
        tx.outreach.findFirst({ where: { companyId: company.id, outcomeStatus: "won" }, select: { id: true } }),
        tx.pastProject.findFirst({ where: { companyId: company.id }, select: { id: true } }),
      ]);
      const collaboration = Boolean(won || project);
      if (input.entryPoint === "contact_history" ? collaboration || !lastSent : !collaboration)
        throw new ApiError("VALIDATION_ERROR", "이 기업은 선택한 이력 화면의 대상이 아닙니다.", {
          details: { entryPoint: input.entryPoint, collaboration, hasSent: Boolean(lastSent) },
        });

      let previousOutreachId = lastSent?.outreachId ?? null;
      if (input.previousOutreachId) {
        const previous = await tx.outreach.findFirst({
          where: { id: input.previousOutreachId, companyId: company.id },
          select: { id: true },
        });
        if (!previous) throw new ApiError("VALIDATION_ERROR", "같은 기업의 이전 작업이 아닙니다.");
        previousOutreachId = previous.id;
      }
      const outreach = await tx.outreach.create({
        data: {
          companyId: company.id,
          acquisitionRoundId: round.id,
          currentTargetQuarterId: round.targetQuarterId,
          previousOutreachId,
          ownerId: member.id,
          route: input.entryPoint === "collaboration_history" ? "repeat_collaboration" : "recontact",
          workStage: "recipient_selection",
          internalDecision: "active",
          sendStatus: "before_send",
        },
      });
      return { status: 201, body: { data: await getHumanOutreachDetail(tx, outreach.id, member) } };
    });
  } catch (error) {
    // 두 사람이 동시에 시작하면 늦은 쪽이 (기업, 회차) 유일 제약에 걸린다. 먼저 만든 작업을 돌려준다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const round = await prisma.acquisitionRound.findFirst({ where: { endedAt: null }, select: { id: true } });
      const existing = round && await prisma.outreach.findFirst({
        where: { companyId: params.companyId, acquisitionRoundId: round.id },
        select: { id: true },
      });
      if (existing) return { status: 200, body: { data: await getHumanOutreachDetail(prisma, existing.id, member) } };
    }
    throw error;
  }
});
