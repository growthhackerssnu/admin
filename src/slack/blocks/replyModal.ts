export const REPLY_MODAL_CALLBACK_ID = "dhbot_reply_modal";

export const REPLY_INTENT_LABEL: Record<string, string> = {
  INTERESTED: "🟢 관심 있음",
  NEEDS_INFO: "🔵 추가 정보 요청",
  DECLINED: "🔴 거절",
  OUT_OF_OFFICE: "⚪ 부재중",
  WRONG_PERSON: "🟡 담당자 아님",
  OTHER: "⚫ 기타",
};

/**
 * Slack의 trigger_id는 슬래시 커맨드가 눌린 시점부터 3초 안에 views.open을 호출해야
 * 유효하다. 모달에 넣을 선택지를 DB에서 미리 조회하고 나서 열면 이 시간을 넘기기
 * 쉬워서(실제로 expired_trigger_id 에러 발생), 드롭다운 없이 텍스트 입력만으로 즉시
 * 열리게 하고, 회사/담당자 매칭은 제출 시점에 한다.
 */
export function buildReplyModal() {
  return {
    type: "modal" as const,
    callback_id: REPLY_MODAL_CALLBACK_ID,
    title: { type: "plain_text" as const, text: "답장 초안 생성" },
    submit: { type: "plain_text" as const, text: "초안 생성" },
    close: { type: "plain_text" as const, text: "취소" },
    blocks: [
      {
        type: "input",
        block_id: "target_search_block",
        label: { type: "plain_text", text: "회사명 또는 담당자 이름" },
        hint: { type: "plain_text", text: "일부만 입력해도 됩니다 (예: 스페이스클라우드, 정수현)" },
        element: {
          type: "plain_text_input",
          action_id: "target_search_input",
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
