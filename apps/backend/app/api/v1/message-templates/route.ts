import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalLead, requireExternalReader } from "@/dh/lib/humanReview/access";
import { withIdempotency } from "@/dh/lib/idempotency";
import { AUTO_FIELDS } from "@/dh/lib/humanReview/messageTemplate";
import { getTemplate, listTemplates, loadSender, serializeTemplate } from "@/dh/lib/humanReview/messageTemplateStore";
import { ApiError } from "@/dh/lib/errors";
import { hasOpsRole } from "@/portal/lib/opsRoles";
import { prisma } from "@/lib/prisma";

const createInput = z.object({
  kind: z.enum(["new", "recontact", "repeat_collaboration"]),
  name: z.string().trim().min(1).max(60),
}).strict();

// 메일 양식 목록. 초안을 만드는 팀원도 양식 이름을 골라야 해서 읽기는 대외협력 팀원 이상에게 연다.
// 고치는 것은 팀장·관리자만 한다(canManage).
export const GET = withListupApiHandler(async (_req, { member }) => {
  requireExternalReader(member);
  const [templates, sender] = await Promise.all([listTemplates(prisma), loadSender(prisma)]);
  return {
    body: {
      data: {
        canManage: member.role === "admin" || (member.role === "acting" && hasOpsRole(member, "external_lead")),
        sender,
        autoFields: AUTO_FIELDS,
        templates: templates.map(serializeTemplate),
      },
    },
  };
});

// 경우 아래에 빈 양식을 하나 더 만든다. 내용은 PUT으로 채운다.
export const POST = withListupApiHandler(async (req, { member }) => {
  requireExternalLead(member);
  const parsed = createInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "양식 이름을 60자 이내로 입력하세요.");
  const input = parsed.data;
  return withIdempotency(req, member, "POST /message-templates", input, async (tx) => {
    const last = await tx.messageTemplate.findFirst({
      where: { kind: input.kind },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const created = await tx.messageTemplate.create({
      data: { kind: input.kind, name: input.name, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    const row = await getTemplate(tx, created.id);
    return { status: 201, body: { data: serializeTemplate(row!) } };
  });
});
