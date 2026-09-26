import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, listBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /outreaches/{id}/contacts
//
// 제외 판정 두 가지:
// 1) prelaunch_contacts와 이름/이메일/링크드인이 일치 — 배포 전 접촉자는 항상 제외
// 2) route가 alternate_contact(다른 관계자)면, 이 outreach의 과거 발송 기록에 이미
//    등장한 contact도 제외 — "다른 관계자에게 제안" 규칙
export const GET = withApiHandler<{ id: string }>(async (_req, { params }) => {
  const outreach = await prisma.outreach.findUnique({
    where: { id: params.id },
    select: { id: true, route: true, companyId: true },
  });
  if (!outreach) throw new ApiError("NOT_FOUND", "컨택 건을 찾을 수 없습니다.");

  const [contacts, prelaunchContacts, pastSends] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId: outreach.companyId },
      include: { endpoints: true },
    }),
    prisma.prelaunchContact.findMany({ where: { companyId: outreach.companyId } }),
    outreach.route === "alternate_contact"
      ? prisma.sentMessage.findMany({
          where: { outreachId: outreach.id },
          select: { recipientContactId: true },
        })
      : Promise.resolve([]),
  ]);

  const alreadyContactedIds = new Set(pastSends.map((s) => s.recipientContactId));

  const items = contacts.map((c) => {
    const prelaunchMatch = prelaunchContacts.find(
      (p) =>
        p.name === c.name ||
        (p.linkedinUrl && p.linkedinUrl === c.linkedinUrl) ||
        c.endpoints.some((e) => p.email && e.address.toLowerCase() === p.email!.toLowerCase()),
    );
    const alreadyContacted = alreadyContactedIds.has(c.id);

    let excludedReason: string | null = null;
    if (prelaunchMatch) excludedReason = "배포 전 접촉 이력이 있는 관계자입니다.";
    else if (alreadyContacted) excludedReason = "이전에 이미 연락한 관계자입니다.";

    return {
      contact_id: c.id,
      name: c.name,
      title: c.title,
      department: c.department,
      linkedin_url: c.linkedinUrl,
      endpoints: c.endpoints.map((e) => ({
        endpoint_id: e.id,
        channel: e.channel,
        address: e.address,
        valid: e.valid,
      })),
      selectable: excludedReason === null,
      excluded_reason: excludedReason,
    };
  });

  // 기업 하나의 관계자 목록이라 페이지네이션하지 않는다.
  return { body: listBody(items, { nextCursor: null, hasMore: false }) };
});
