import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";

type Tx = Prisma.TransactionClient;
type Channel = "linkedin" | "email";

export function validAddress(channel: Channel, address: string) {
  if (channel === "email") return z.string().email().safeParse(address).success;
  try {
    const url = new URL(address);
    return url.protocol === "https:" &&
      (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com")) &&
      /^\/in\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

// 사람이 입력한 관계자 한 명과 연락 주소를 기업의 Contact·ContactEndpoint로 저장한다.
// contactId가 있으면 그 관계자의 이름·직함을 수정하고, 없으면 같은 주소의 기존 관계자를
// 재사용하거나 새로 만든다. 다른 기업의 행은 건드리지 않는다.
export async function upsertRecipient(
  tx: Tx,
  companyId: string,
  input: { contactId?: string; name: string; title?: string; channel: Channel; address: string },
) {
  const address = input.channel === "email" ? input.address.toLowerCase() : input.address;
  let endpoint = await tx.contactEndpoint.findUnique({
    where: { companyId_channel_address: { companyId, channel: input.channel, address } },
    include: { contact: true },
  });
  let contactId: string;
  if (input.contactId) {
    if (endpoint?.contactId && endpoint.contactId !== input.contactId)
      throw new ApiError("STATE_CONFLICT", "같은 연락 주소가 다른 관계자에게 연결되어 있습니다.");
    const changedContact = await tx.contact.updateMany({
      where: { id: input.contactId, companyId },
      data: { name: input.name, title: input.title ?? null },
    });
    if (!changedContact.count)
      throw new ApiError("STATE_CONFLICT", "수정할 관계자를 찾지 못했습니다. 다시 불러온 뒤 수정하세요.");
    contactId = input.contactId;
  } else if (endpoint?.contact) {
    if (endpoint.contact.name !== input.name || (endpoint.contact.title ?? "") !== (input.title ?? ""))
      throw new ApiError("STATE_CONFLICT", "같은 연락 주소가 다른 관계자 정보에 연결되어 있습니다.");
    contactId = endpoint.contact.id;
  } else {
    const contact = await tx.contact.create({
      data: { companyId, name: input.name, title: input.title ?? null },
    });
    contactId = contact.id;
  }
  if (!endpoint) {
    endpoint = await tx.contactEndpoint.create({
      data: {
        companyId,
        contactId,
        channel: input.channel,
        address,
        ownerType: "person",
        discoveryMethod: "user_provided",
        ownershipStatus: "supported",
        validationStatus: "valid_format",
        reachabilityStatus: "unknown",
        linkedinMethods: [],
        checkedAt: new Date(),
      },
      include: { contact: true },
    });
  } else if (!endpoint.contactId) {
    endpoint = await tx.contactEndpoint.update({
      where: { id: endpoint.id },
      data: { contactId },
      include: { contact: true },
    });
  }
  return { contactId, endpointId: endpoint.id, channel: endpoint.channel };
}
