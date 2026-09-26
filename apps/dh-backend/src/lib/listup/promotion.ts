import type { Prisma } from "@/generated/prisma";
import { ApiError } from "../errors";

// 발견 쪽에서 확보한 연락 창구를 발송 작업의 수신자로 넘기는 이음새.
//
// v0.4 §8.4에 따라 관계자·연락 수단이 발송 쪽과 **같은 테이블**이 되면서 값을 복사할
// 필요가 없어졌다. 이제 하는 일은 "이 평가가 쓸 만한지 확인하고 그 endpoint를 컨택
// 건의 수신자로 지정"하는 것뿐이다.
//
// 아직 호출자가 없다. 프론트의 "컨택 작업으로 넘기기" 버튼이 쓸 경로는 v0.4 §6.8의
// `PUT /outreaches/{id}/recipient`로 흡수될 가능성이 커서, 계약을 정한 뒤 연결한다.
export async function promoteOptionToRecipient(
  tx: Prisma.TransactionClient,
  input: { candidateId: string; endpointId: string; outreachId: string },
): Promise<{ contactId: string | null; endpointId: string }> {
  const evaluation = await tx.contactOptionAssessment.findUnique({
    where: {
      candidateId_endpointId: { candidateId: input.candidateId, endpointId: input.endpointId },
    },
    include: { endpoint: true },
  });
  if (!evaluation) {
    throw new ApiError("NOT_FOUND", "연락 선택지 평가를 찾을 수 없습니다.");
  }
  if (evaluation.status !== "usable") {
    throw new ApiError("INVALID_STATE", "사용 가능으로 판정된 창구만 인계할 수 있습니다.", {
      fieldErrors: { status: evaluation.status },
    });
  }

  const outreach = await tx.outreach.findUnique({
    where: { id: input.outreachId },
    select: { companyId: true },
  });
  if (!outreach || outreach.companyId !== evaluation.endpoint.companyId) {
    throw new ApiError("VALIDATION_ERROR", "연락 창구가 이 기업의 것이 아닙니다.", {
      fieldErrors: { endpointId: "다른 기업의 창구" },
    });
  }

  // 채널은 사람이 고르는 것이 원칙이라(P-09) 여기서는 endpoint의 채널을 그대로 따른다.
  await tx.outreach.update({
    where: { id: input.outreachId },
    data: {
      recipientContactId: evaluation.endpoint.contactId,
      recipientEndpointId: evaluation.endpoint.id,
      selectedChannel: evaluation.endpoint.channel,
      selectionVersion: { increment: 1 },
      version: { increment: 1 },
    },
  });

  return { contactId: evaluation.endpoint.contactId, endpointId: evaluation.endpoint.id };
}
