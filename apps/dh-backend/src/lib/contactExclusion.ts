import { prisma } from "./prisma";
import type { Route } from "@/generated/prisma";

// #07(관계자 후보 조회)과 #20(수신자 선택)이 공유하는 제외 판정.
// 1) prelaunch_contacts와 이름/이메일/링크드인이 일치 — 배포 전 접촉자는 항상 제외
// 2) alternate_contact(다른 관계자) 경로면, 이 outreach의 과거 발송 기록에 이미
//    등장한 contact도 제외 — "다른 관계자에게 제안" 규칙
export async function findExclusionReason(params: {
  outreachId: string;
  companyId: string;
  route: Route;
  contactId: string;
}): Promise<string | null> {
  const contact = await prisma.contact.findUnique({
    where: { id: params.contactId },
    include: { endpoints: true },
  });
  if (!contact) return null;

  const prelaunchContacts = await prisma.prelaunchContact.findMany({
    where: { companyId: params.companyId },
  });
  const prelaunchMatch = prelaunchContacts.find(
    (p) =>
      p.name === contact.name ||
      (p.linkedinUrl && p.linkedinUrl === contact.linkedinUrl) ||
      contact.endpoints.some((e) => p.email && e.address.toLowerCase() === p.email!.toLowerCase()),
  );
  if (prelaunchMatch) return "배포 전 접촉 이력이 있는 관계자입니다.";

  if (params.route === "alternate_contact") {
    const alreadyContacted = await prisma.sentMessage.findFirst({
      where: { outreachId: params.outreachId, recipientContactId: params.contactId },
      select: { id: true },
    });
    if (alreadyContacted) return "이전에 이미 연락한 관계자입니다.";
  }

  return null;
}
