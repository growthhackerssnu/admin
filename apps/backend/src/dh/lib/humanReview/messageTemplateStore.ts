import type { Prisma } from "@/generated/prisma";
import { SOCIETY_EMAIL, suggestTemplate, type TemplateKind } from "@/dh/lib/humanReview/messageTemplate";

type Tx = Prisma.TransactionClient;

const currentVersionInclude = {
  versions: {
    orderBy: { version: "desc" },
    take: 1,
    include: { createdBy: { select: { displayName: true } } },
  },
} satisfies Prisma.MessageTemplateInclude;

type TemplateRow = Prisma.MessageTemplateGetPayload<{ include: typeof currentVersionInclude }>;

export function serializeTemplate(row: TemplateRow) {
  // currentVersion이 0이면 아직 내용이 없는 빈 양식이다.
  const current = row.currentVersion > 0 ? row.versions[0] : undefined;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    version: row.currentVersion,
    subject: current?.subject ?? "",
    body: current?.body ?? "",
    aiInstructions: (current?.aiInstructions ?? {}) as Record<string, string>,
    updatedAt: current ? current.createdAt.toISOString() : null,
    updatedBy: current?.createdBy?.displayName ?? null,
  };
}

export async function listTemplates(tx: Tx, kind?: TemplateKind) {
  return tx.messageTemplate.findMany({
    where: kind ? { kind } : undefined,
    include: currentVersionInclude,
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getTemplate(tx: Tx, id: string) {
  return tx.messageTemplate.findUnique({ where: { id }, include: currentVersionInclude });
}

// 메일 끝에 들어가는 발신 정보. 인수인계 기간엔 두 기수의 팀장이 함께 있어 최근 기수의 팀장을 쓴다.
// 전화번호는 노션 명단에서 동기화한 값이다.
export async function loadSender(tx: Tx) {
  const row = await tx.memberOpsRole.findFirst({
    where: { opsRole: "external_lead", member: { active: true, role: "acting" } },
    orderBy: { cohort: { sort: "desc", nulls: "last" } },
    select: { member: { select: { displayName: true, claimedPersonEntry: { select: { phone: true } } } } },
  });
  return {
    leadName: row?.member.displayName ?? null,
    leadPhone: row?.member.claimedPersonEntry?.phone?.trim() || null,
    email: SOCIETY_EMAIL,
  };
}

// 이 작업에 기본으로 쓸 양식. 과거 컨택은 직전 연락의 결과에 맞춰 고른다.
export async function suggestedTemplateId(
  tx: Tx,
  kind: TemplateKind,
  previousOutreachId: string | null,
): Promise<string | null> {
  const [templates, previous] = await Promise.all([
    tx.messageTemplate.findMany({
      where: { kind },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, key: true, currentVersion: true },
    }),
    previousOutreachId
      ? tx.outreach.findUnique({
          where: { id: previousOutreachId },
          select: {
            outcomeStatus: true,
            outcomeEvents: { where: { revisitCondition: { not: null } }, select: { id: true }, take: 1 },
          },
        })
      : null,
  ]);
  return suggestTemplate(
    templates,
    previous ? { outcome: previous.outcomeStatus, hasRevisitCondition: previous.outcomeEvents.length > 0 } : null,
  )?.id ?? null;
}
