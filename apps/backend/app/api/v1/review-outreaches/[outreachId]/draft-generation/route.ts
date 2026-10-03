import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireReviewOwner } from "@/dh/lib/humanReview/access";
import { getHumanOutreachDetail } from "@/dh/lib/humanReview/outreach";
import { readIdempotentResult, withIdempotency } from "@/dh/lib/idempotency";
import { generateRecontactDraft } from "@/dh/lib/humanReview/recontactGeneration";
import { assertRoundOpen } from "@/dh/lib/rounds";
import { ApiError } from "@/dh/lib/errors";
import {
  collaborationExamples,
  companyWithWaGwa,
  draftGenerationSchema,
  draftPrompt,
  normalizeDraftGeneration,
  recipientLabels,
  renderOutreachTemplate,
  type DraftGenerationOutput,
  type SupportedArea,
} from "@/dh/lib/outreachDraft";
import {
  HUMAN_REVIEW_BODY,
  HUMAN_REVIEW_SUBJECT,
  HUMAN_REVIEW_TEMPLATE_VERSION,
  quarterSchedule,
} from "@/dh/config/humanReviewMessageTemplate";
import { runStructuredOutput } from "@/dh/lib/listup/gemini";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;
const generateInput = z.object({
  expectedVersion: z.number().int().positive(),
  projectIds: z.array(z.string().min(1)).max(50).optional()
    .refine((ids) => !ids || new Set(ids).size === ids.length, "중복된 projectId가 있습니다."),
}).strict();
type OutreachDetail = Awaited<ReturnType<typeof getHumanOutreachDetail>>;

const areaLabels: Record<string, string> = {
  product_service: "제품·서비스",
  target_customer: "주요 고객",
  revenue_model: "수익 모델",
  user_journey: "사용자 여정",
  operations: "운영 방식",
  recent_change: "최근 변화",
  public_challenge: "공개된 과제",
};

export const POST = withListupApiHandler<{ outreachId: string }>(async (req, { member, params }) => {
  const parsed = generateInput.safeParse(await req.json());
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "초안 생성 요청이 올바르지 않습니다.");
  const input = parsed.data;
  const route = `/review-outreaches/${params.outreachId}/draft-generation`;
  const outreach = await prisma.outreach.findUnique({
    where: { id: params.outreachId },
    include: {
      company: { select: { id: true, name: true, product: true, domain: true, version: true } },
      currentTargetQuarter: { select: { id: true, year: true, quarter: true } },
      acquisitionRound: { select: { endedAt: true } },
      recipientContact: { select: { id: true, name: true, title: true } },
      recipientEndpoint: { select: { id: true, channel: true, ownerType: true, address: true } },
      candidate: {
        include: {
          currentResearch: { include: { claims: true } },
          activeReviewDecision: true,
        },
      },
      sentMessages: { select: { id: true }, take: 1 },
    },
  });
  if (!outreach) throw new ApiError("NOT_FOUND", "메시지 업무를 찾지 못했습니다.");
  requireReviewOwner(member, outreach.ownerId);
  const replay = await readIdempotentResult<{ data: OutreachDetail }>(req, member, route, input);
  if (replay) return replay;
  if (outreach.version !== input.expectedVersion)
    throw new ApiError("VERSION_CONFLICT", "메시지 업무가 변경됐습니다. 다시 조회하세요.");
  if (outreach.sendStatus !== "before_send" || outreach.sentMessages.length)
    throw new ApiError("STATE_CONFLICT", "이미 발송된 기업의 초안은 다시 만들 수 없습니다.");
  assertRoundOpen(outreach);
  if (!outreach.candidateId)
    return generateRecontactDraft({ req, member, route, outreachId: outreach.id, input });
  if (input.projectIds !== undefined)
    throw new ApiError("VALIDATION_ERROR", "projectIds는 재연락·재협업 작업에서만 쓸 수 있습니다.");
  const candidate = outreach.candidate;
  if (
    !candidate || candidate.reviewStatus !== "approved" ||
    candidate.activeReviewDecision?.action !== "approve" ||
    !candidate.currentResearch || !outreach.recipientContact || !outreach.recipientEndpoint
  ) throw new ApiError("STATE_CONFLICT", "사람 승인, 저장된 조사, 수신자가 모두 필요합니다.");
  const researchId = candidate.currentResearch.id;
  const reviewDecisionId = candidate.activeReviewDecision.id;
  const claimEvidenceIds = [...new Set(candidate.currentResearch.claims.flatMap((claim) => claim.evidenceIds))];
  const evidence = await prisma.evidence.findMany({
    where: { id: { in: claimEvidenceIds }, companyId: outreach.companyId },
    select: { id: true, title: true, excerpt: true, url: true },
  });
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const supportedAreas: SupportedArea[] = candidate.currentResearch.claims
    .map((claim) => ({
      area: areaLabels[claim.category] ?? claim.category,
      evidenceIds: claim.evidenceIds.filter((id) => evidenceIds.has(id)),
      targetBusinessOutcome: "저장된 공개 사실을 바탕으로 검토할 프로젝트 가설",
    }))
    .filter((area) => area.evidenceIds.length > 0);
  if (!supportedAreas.length)
    throw new ApiError("STATE_CONFLICT", "초안을 만들 수 있는 조사 근거가 없습니다.");
  const [projects, lead] = await Promise.all([
    prisma.pastProject.findMany({
      where: { companyId: { not: outreach.companyId } },
      include: { company: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { quarter: "desc" }, { title: "asc" }],
      take: 100,
    }),
    prisma.member.findFirst({
      where: { active: true, role: "acting", opsRole: "external_lead" },
      select: { displayName: true },
    }),
  ]);
  if (!lead) throw new ApiError("SERVICE_UNAVAILABLE", "대외협력 팀장 이름이 설정되지 않았습니다.");
  const portfolio = projects.map((project) => ({
    id: project.id,
    title: project.title,
    summary: project.summary,
    companyName: project.company.name,
  }));
  const generation = await runStructuredOutput<DraftGenerationOutput>(
    draftPrompt({
      company: outreach.company,
      recipient: {
        name: outreach.recipientContact.name,
        title: outreach.recipientContact.title,
        channel: outreach.recipientEndpoint.channel,
        ownerType: outreach.recipientEndpoint.ownerType,
      },
      criteriaPrompt: "This is message drafting after a human approval, not fit scoring. Treat the supplied evidence buckets as source categories. Do not assert access to internal data or invent outcomes. Use no web search.",
      claims: candidate.currentResearch.claims,
      evidence,
      supportedAreas,
      pastProjects: portfolio,
    }),
    draftGenerationSchema,
  );
  const generated = normalizeDraftGeneration(generation.value, {
    evidenceIds,
    supportedAreas,
    pastProjects: portfolio,
  });
  const labels = recipientLabels({
    companyName: outreach.company.name,
    contactName: outreach.recipientContact.name,
    contactTitle: outreach.recipientContact.title,
    ownerType: outreach.recipientEndpoint.ownerType,
  });
  const schedule = quarterSchedule(outreach.currentTargetQuarter.year, outreach.currentTargetQuarter.quarter);
  const values = {
    companyName: outreach.company.name,
    recipientGreeting: labels.greeting,
    recipientReference: labels.reference,
    companyWithWaGwa: companyWithWaGwa(outreach.company.name),
    collaborationExamples: collaborationExamples(portfolio, generated.pastProjectIds),
    motivation: generated.motivation,
    projectIdeas: generated.projectIdeas.map((idea) => `- ${idea.title}`).join("\n"),
    leadName: lead.displayName,
    ...schedule,
  };
  const subject = renderOutreachTemplate(HUMAN_REVIEW_SUBJECT, values);
  const body = renderOutreachTemplate(HUMAN_REVIEW_BODY, values);

  return withIdempotency(req, member, route, input, async (tx) => {
    const current = await tx.outreach.findUniqueOrThrow({
      where: { id: outreach.id },
      include: { candidate: true, sentMessages: { select: { id: true }, take: 1 } },
    });
    if (
      current.version !== input.expectedVersion || current.sendStatus !== "before_send" ||
      current.sentMessages.length || current.companyId !== outreach.companyId ||
      current.acquisitionRoundId !== outreach.acquisitionRoundId ||
      current.candidate?.currentResearchId !== researchId ||
      current.candidate?.activeReviewDecisionId !== reviewDecisionId ||
      current.candidate?.reviewStatus !== "approved" ||
      current.recipientContactId !== outreach.recipientContactId ||
      current.recipientEndpointId !== outreach.recipientEndpointId ||
      current.currentTargetQuarterId !== outreach.currentTargetQuarterId
    ) throw new ApiError("STALE_GENERATION", "생성 중 조사·판단·수신자 또는 분기가 변경됐습니다. 다시 생성하세요.");
    const revision = (current.currentRevision ?? 0) + 1;
    const changed = await tx.outreach.updateMany({
      where: { id: current.id, version: input.expectedVersion, sendStatus: "before_send" },
      data: { currentRevision: revision, workStage: "draft_review", version: { increment: 1 } },
    });
    if (!changed.count) throw new ApiError("STALE_GENERATION", "메시지 업무가 변경됐습니다. 다시 생성하세요.");
    await tx.messageDraftRevision.create({
      data: {
        outreachId: current.id,
        revision,
        topic: generated.topic,
        subject,
        body,
        templateVersion: HUMAN_REVIEW_TEMPLATE_VERSION,
        createdBy: "ai",
        generationResearchId: researchId,
        generationReviewDecisionId: reviewDecisionId,
        recipientContactId: current.recipientContactId,
        recipientEndpointId: current.recipientEndpointId,
        recipientSnapshot: {
          name: outreach.recipientContact!.name,
          title: outreach.recipientContact!.title,
          channel: outreach.recipientEndpoint!.channel,
          address: outreach.recipientEndpoint!.address,
        },
        targetQuarterId: current.currentTargetQuarterId,
        contactPurposeSnapshot: current.contactPurpose,
      },
    });
    return { status: 201, body: { data: await getHumanOutreachDetail(tx, current.id, member) } };
  });
});
