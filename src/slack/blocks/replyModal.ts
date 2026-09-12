export const REPLY_MODAL_CALLBACK_ID = "dhbot_reply_modal";

export const REPLY_INTENT_LABEL: Record<string, string> = {
  INTERESTED: "🟢 관심 있음",
  NEEDS_INFO: "🔵 추가 정보 요청",
  DECLINED: "🔴 거절",
  OUT_OF_OFFICE: "⚪ 부재중",
  WRONG_PERSON: "🟡 담당자 아님",
  OTHER: "⚫ 기타",
};

export function buildReplyModal(targets: { contactCandidateId: string; label: string }[]) {
  return {
    type: "modal" as const,
    callback_id: REPLY_MODAL_CALLBACK_ID,
    title: { type: "plain_text" as const, text: "답장 초안 생성" },
    submit: { type: "plain_text" as const, text: "초안 생성" },
    close: { type: "plain_text" as const, text: "취소" },
    blocks: [
      {
        type: "input",
        block_id: "target_block",
        label: { type: "plain_text", text: "어떤 아웃리치에 대한 답장인가요?" },
        element: {
          type: "static_select",
          action_id: "target_select",
          placeholder: { type: "plain_text", text: "회사 - 담당자 선택" },
          options: targets.map((t) => ({
            text: { type: "plain_text", text: t.label.slice(0, 75) },
            value: t.contactCandidateId,
          })),
        },
      },
      {
        type: "input",
        block_id: "reply_text_block",
        label: { type: "plain_text", text: "받은 답장 원문" },
        element: {
          type: "plain_text_input",
          action_id: "reply_text_input",
          multiline: true,
        },
      },
    ],
  };
}
