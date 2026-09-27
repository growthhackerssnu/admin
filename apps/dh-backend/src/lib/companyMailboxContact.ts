import type { Prisma } from "@/generated/prisma";

type CompanyIdentity = { id: string; name: string };

function mailboxContactName(company: CompanyIdentity) {
  return `${company.name} 담당자`;
}

// A published shared mailbox needs a selectable Contact, but it must never be
// represented as an invented person. This label is deliberately generic.
export async function ensureCompanyMailboxContact(
  tx: Prisma.TransactionClient,
  company: CompanyIdentity,
  endpointId: string,
) {
  const endpoint = await tx.contactEndpoint.findUnique({
    where: { id: endpointId },
    select: { id: true, companyId: true, contactId: true, ownerType: true },
  });
  if (
    !endpoint ||
    endpoint.companyId !== company.id ||
    endpoint.ownerType !== "company"
  )
    return null;
  if (endpoint.contactId) return endpoint.contactId;

  const name = mailboxContactName(company);
  const contact =
    (await tx.contact.findFirst({
      where: { companyId: company.id, name, role: "company_mailbox" },
      select: { id: true },
    })) ??
    (await tx.contact.create({
      data: {
        companyId: company.id,
        name,
        role: "company_mailbox",
      },
      select: { id: true },
    }));

  await tx.contactEndpoint.updateMany({
    where: { id: endpoint.id, contactId: null },
    data: { contactId: contact.id },
  });
  return contact.id;
}

export async function ensureCompanyMailboxContacts(
  tx: Prisma.TransactionClient,
  company: CompanyIdentity,
) {
  const endpoints = await tx.contactEndpoint.findMany({
    where: { companyId: company.id, ownerType: "company", contactId: null },
    select: { id: true },
  });
  await Promise.all(
    endpoints.map((endpoint) =>
      ensureCompanyMailboxContact(tx, company, endpoint.id),
    ),
  );
}
