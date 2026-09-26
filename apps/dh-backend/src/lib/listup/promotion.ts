import type { Prisma } from "@/generated/prisma";
import { ApiError } from "../errors";

// 발견 쪽에서 확보한 연락 창구를 발송 쪽 Contact/ContactEndpoint로 넘기는 이음새.
//
// src/lib/listup/** 중 발송 도메인 모델을 건드리는 유일한 파일이다. 반대 방향
// (발송 코드가 발견 테이블을 읽는) 의존은 만들지 않는다 — 발송 기능은 나중에
// 재작업될 예정이라, 그때 이 파일 하나만 고치면 되게 경계를 좁혀둔다.
//
// 아직 호출자가 없다. 프론트의 "컨택 작업 인계"(canHandoff) 버튼이 쓸 엔드포인트
// 형태는 명세 범위 밖이라 합의가 필요하다.
export async function promoteChannelToOutreachContact(
  tx: Prisma.TransactionClient,
  input: { candidateId: string; contactChannelId: string },
): Promise<{ contactId: string; endpointId: string }> {
  const evaluation = await tx.candidateContact.findUnique({
    where: {
      candidateId_contactChannelId: {
        candidateId: input.candidateId,
        contactChannelId: input.contactChannelId,
      },
    },
    include: { contactChannel: { include: { person: true } } },
  });
  if (!evaluation) {
    throw new ApiError("NOT_FOUND", "후보의 연락 창구 평가를 찾을 수 없습니다.");
  }
  if (evaluation.status !== "usable") {
    throw new ApiError("INVALID_STATE", "사용 가능으로 판정된 창구만 인계할 수 있습니다.", {
      fieldErrors: { status: evaluation.status },
    });
  }

  const channel = evaluation.contactChannel;
  const name = channel.person?.name ?? "담당자 미상";

  // 발송 쪽 Contact는 (기업, 이름)으로 식별한다 — 발견 쪽 person_id를 발송 테이블에
  // 심으면 두 도메인이 다시 묶이므로 값만 옮긴다.
  const existingContact = await tx.contact.findFirst({
    where: { companyId: channel.companyId, name },
  });
  const contact =
    existingContact ??
    (await tx.contact.create({
      data: {
        companyId: channel.companyId,
        name,
        title: channel.person?.jobTitle ?? null,
        linkedinUrl: channel.type === "linkedin" ? channel.value : null,
      },
    }));

  const existingEndpoint = await tx.contactEndpoint.findFirst({
    where: { companyId: channel.companyId, channel: channel.type, address: channel.value },
  });
  const endpoint =
    existingEndpoint ??
    (await tx.contactEndpoint.create({
      data: {
        companyId: channel.companyId,
        contactId: contact.id,
        channel: channel.type,
        address: channel.value,
      },
    }));

  return { contactId: contact.id, endpointId: endpoint.id };
}
