import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { cleanInstructions, parseSlots, templateProblems } from "@/dh/lib/humanReview/messageTemplate";
import { getTemplate, serializeTemplate } from "@/dh/lib/humanReview/messageTemplateStore";
import { ApiError } from "@/dh/lib/errors";

const saveInput = z.object({
  // 화면이 불러온 버전. 그 사이 다른 사람이 저장했으면 거절한다.
  expectedVersion: z.number().int().min(0),
  name: z.string().trim().min(1).max(60),
  subject: z.string().max(500),
  body: z.string().max(20000),
  aiInstructions: z.record(z.string().max(2000)),
}).strict();

// 양식을 저장하면 새 버전이 쌓인다. 이전 버전은 지우지 않고, 이후 만드는 초안부터 새 버전을 쓴다.
export const PUT = withListupApiHandler<{ templateId: string }>(async (req, { member, params }) => {
  requireExternalLead(member);
  const parsed = saveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "양식 저장 요청이 올바르지 않습니다.");
  const input = parsed.data;
  const problems = templateProblems(input.subject, input.body);
  if (problems.length)
    throw new ApiError("VALIDATION_ERROR", problems.join(" "), { details: { problems } });
  const aiInstructions = cleanInstructions(input.aiInstructions, parseSlots(input.subject, input.body).ai);

  return withIdempotency(req, member, `PUT /message-templates/${params.templateId}`, input, async (tx) => {
    const template = await tx.messageTemplate.findUnique({ where: { id: params.templateId } });
    if (!template) throw new ApiError("NOT_FOUND", "양식을 찾지 못했습니다.");
    const version = template.currentVersion + 1;
    // 버전 번호를 조건에 넣어 동시에 저장한 두 요청 중 하나만 성공하게 한다.
    const changed = await tx.messageTemplate.updateMany({
      where: { id: template.id, currentVersion: input.expectedVersion },
      data: { name: input.name, currentVersion: version },
    });
    if (!changed.count)
      throw new ApiError("VERSION_CONFLICT", "다른 사람이 먼저 양식을 고쳤습니다. 다시 불러온 뒤 저장하세요.");
    await tx.messageTemplateVersion.create({
      data: {
        templateId: template.id,
        version,
        subject: input.subject.trim(),
        body: input.body.trim(),
        aiInstructions,
        createdById: member.id,
      },
    });
    const row = await getTemplate(tx, template.id);
    return { status: 200, body: { data: serializeTemplate(row!) } };
  });
});
