export const COMPANY_REJECT_MODAL_CALLBACK_ID = "company_reject_modal";

/**
 * 거절 사유를 사람이 직접 분류하게 한다: "조건 자체가 안 맞음"이면 영구 제외해
 * 다시는 재조사 대상에 올리지 않고, "타이밍/여력 문제"면 쿨다운 후 재조사(Phase 5-2
 * 잊혀진 기업 재조사)가 가능하도록 남겨둔다. PRD 플로우차트의 "거절 사유 반영 후
 * 재리서치"에 해당하는 부분 — 지금까지는 전부 재조사 가능으로 기본값 처리했었다.
 */
export function buildCompanyRejectModal(runCompanyId: string) {
  return {
    type: "modal" as const,
    callback_id: COMPANY_REJECT_MODAL_CALLBACK_ID,
    private_metadata: runCompanyId,
    title: { type: "plain_text" as const, text: "거절 사유" },
    submit: { type: "plain_text" as const, text: "기록" },
    close: { type: "plain_text" as const, text: "취소" },
    blocks: [
      {
        type: "input",
        block_id: "category_block",
        label: { type: "plain_text", text: "거절 사유 분류" },
        element: {
          type: "radio_buttons",
          action_id: "category_select",
          options: [
            {
              text: { type: "plain_text", text: "조건 자체가 안 맞음 (업종/규모 등) — 영구 제외" },
              value: "PERMANENT_DISQUALIFY",
            },
            {
              text: { type: "plain_text", text: "타이밍/여력 문제 — 나중에 재조사 가능" },
              value: "COOLDOWN_ELIGIBLE",
            },
          ],
        },
      },
      {
        type: "input",
        block_id: "reason_block",
        optional: true,
        label: { type: "plain_text", text: "상세 사유 (선택)" },
        element: {
          type: "plain_text_input",
          action_id: "reason_input",
          multiline: true,
        },
      },
    ],
  };
}
