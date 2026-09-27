import type { ConditionsSnapshot } from "@/config/listupExecution";
import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import {
  collaborationExamples,
  companyWithWaGwa,
  draftGenerationSchema,
  draftPrompt,
  normalizeDraftGeneration,
  recipientLabels,
  renderOutreachTemplate,
  type DraftGenerationOutput,
} from "@/lib/outreachDraft";
import { assertCanModify } from "@/lib/permissions";
import { assertVersionMatch } from "@/lib/revision";
import { serializeOutreachDetail } from "@/lib/serializers/outreach";
import { generateDraftSchema } from "@/lib/validation/outreach";
import { runStructuredOutput } from "@/lib/listup/openaiWebSearch";

// POST /outreaches/{id}/draft-generation — AI는 빈칸 값만 만든다. 고정 문구는
// Template에서 읽고 서버가 조립하며, 발송이나 웹 검색은 수행하지 않는다.
export const POST = withApiHandler<{ id: string }>(
  async (req, { member, params }) => {
    const body = await req.json().catch(() => null);
    const parsed = generateDraftSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
        fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
      });

    return withIdempotency(
      req,
      member,
      "POST /outreaches/:id/draft-generation",
      parsed.data,
      async (tx) => {
        const outreach = await tx.outreach.findUnique({
          where: { id: params.id },
          include: {
            company: {
              select: { id: true, name: true, product: true, domain: true },
            },
            recipientContact: { select: { id: true, name: true, title: true } },
            recipientEndpoint: {
              select: { id: true, channel: true, ownerType: true },
            },
          },
        });
        assertVersionMatch(
          outreach,
          outreach?.version,
          parsed.data.expectedVersion,
        );
        assertCanModify(member, outreach.ownerId);
        if (
          outreach.route !== "new" ||
          outreach.workStage !== "recipient_selection"
        ) {
          throw new ApiError(
            "INVALID_STATE",
            "신규 기업의 수신자 선택 단계에서만 초안을 생성할 수 있습니다.",
          );
        }
        if (!outreach.recipientContact || !outreach.recipientEndpoint) {
          throw new ApiError(
            "INVALID_STATE",
            "초안을 생성할 수신자를 먼저 선택하세요.",
          );
        }

        const templates = await tx.template.findMany({
          where: {
            route: "new",
            channel: outreach.recipientEndpoint.channel,
            active: true,
          },
          orderBy: { version: "desc" },
          take: 2,
        });
        if (templates.length !== 1) {
          throw new ApiError(
            "TEMPLATE_NOT_CONNECTED",
            "선택한 채널의 활성 신규 기업 템플릿이 필요합니다.",
          );
        }
        const template = templates[0]!;

        const candidate = await tx.candidate.findUnique({
          where: { companyId: outreach.companyId },
          include: {
            originSearchRun: { select: { conditionsSnapshot: true } },
            currentResearch: { include: { claims: true } },
            latestSystemAssessment: { include: { interventions: true } },
          },
        });
        if (
          !candidate ||
          candidate.effectiveFit !== "fit" ||
          !candidate.currentResearch ||
          !candidate.latestSystemAssessment
        ) {
          throw new ApiError(
            "FIT_REQUIRED",
            "근거가 있는 적합 판정과 최신 조사 보고서가 필요합니다.",
          );
        }

        const supportedAreas = candidate.latestSystemAssessment.interventions
          .filter(
            (intervention) =>
              intervention.possibilityVerdict === "supported" &&
              intervention.valueVerdict === "supported",
          )
          .map((intervention) => ({
            area: intervention.area,
            evidenceIds: [
              ...new Set([
                ...intervention.possibilityEvidenceIds,
                ...intervention.valueEvidenceIds,
              ]),
            ],
            targetBusinessOutcome: intervention.targetBusinessOutcome,
          }));
        if (!supportedAreas.length) {
          throw new ApiError(
            "FIT_REQUIRED",
            "프로젝트 주제를 뒷받침하는 적합 판정 근거가 없습니다.",
          );
        }

        const claimEvidenceIds = [
          ...new Set(
            candidate.currentResearch.claims.flatMap(
              (claim) => claim.evidenceIds,
            ),
          ),
        ];
        const evidence = await tx.evidence.findMany({
          where: {
            id: { in: claimEvidenceIds },
            companyId: outreach.companyId,
          },
          select: { id: true, title: true, excerpt: true, url: true },
        });
        const evidenceIdSet = new Set(evidence.map((item) => item.id));
        const verifiedSupportedAreas = supportedAreas.map((area) => ({
          ...area,
          evidenceIds: area.evidenceIds.filter((id) => evidenceIdSet.has(id)),
        }));
        if (verifiedSupportedAreas.some((area) => !area.evidenceIds.length)) {
          throw new ApiError(
            "FIT_REQUIRED",
            "적합 판정의 조사 근거를 찾을 수 없습니다.",
          );
        }

        const pastProjects = await tx.pastProject.findMany({
          where: { companyId: { not: outreach.companyId } },
          include: { company: { select: { name: true } } },
          orderBy: [{ year: "desc" }, { quarter: "desc" }, { title: "asc" }],
          take: 100,
        });
        const portfolio = pastProjects.map((project) => ({
          id: project.id,
          title: project.title,
          summary: project.summary,
          companyName: project.company.name,
        }));
        const snapshot = candidate.originSearchRun
          .conditionsSnapshot as unknown as ConditionsSnapshot;
        const result = await runStructuredOutput<DraftGenerationOutput>(
          draftPrompt({
            company: outreach.company,
            recipient: {
              name: outreach.recipientContact.name,
              title: outreach.recipientContact.title,
              channel: outreach.recipientEndpoint.channel,
              ownerType: outreach.recipientEndpoint.ownerType,
            },
            criteriaPrompt: snapshot.fitCriteria.systemPrompt,
            claims: candidate.currentResearch.claims,
            evidence,
            supportedAreas: verifiedSupportedAreas,
            pastProjects: portfolio,
          }),
          draftGenerationSchema,
        );
        const generated = normalizeDraftGeneration(result.value, {
          evidenceIds: evidenceIdSet,
          supportedAreas: verifiedSupportedAreas,
          pastProjects: portfolio,
        });
        const labels = recipientLabels({
          companyName: outreach.company.name,
          contactName: outreach.recipientContact.name,
          contactTitle: outreach.recipientContact.title,
          ownerType: outreach.recipientEndpoint.ownerType,
        });
        const values = {
          companyName: outreach.company.name,
          recipientGreeting: labels.greeting,
          recipientReference: labels.reference,
          companyWithWaGwa: companyWithWaGwa(outreach.company.name),
          collaborationExamples: collaborationExamples(
            portfolio,
            generated.pastProjectIds,
          ),
          motivation: generated.motivation,
          projectIdeas: generated.projectIdeas
            .map((idea) => `- ${idea.title}`)
            .join("\n"),
        };
        const subject = renderOutreachTemplate(
          template.subjectTemplate,
          values,
        );
        const draftBody = renderOutreachTemplate(template.bodyTemplate, values);
        const revision = (outreach.currentRevision ?? 0) + 1;

        await tx.messageDraftRevision.create({
          data: {
            outreachId: outreach.id,
            revision,
            topic: generated.topic,
            subject,
            body: draftBody,
            templateId: template.id,
            templateVersion: template.version,
            createdBy: "ai",
          },
        });
        const updated = await tx.outreach.updateMany({
          where: { id: outreach.id, version: parsed.data.expectedVersion },
          data: {
            currentRevision: revision,
            approvedRevision: null,
            workStage: "draft_review",
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new ApiError(
            "VERSION_CONFLICT",
            "다른 곳에서 먼저 컨택 업무가 변경되었습니다.",
          );

        return {
          status: 201,
          body: successBody(await serializeOutreachDetail(outreach.id, tx)),
        };
      },
    );
  },
);
