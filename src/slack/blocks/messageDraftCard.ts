import { SLACK_APPROVAL_CHANNEL_ID, slackClient } from "../client";

export const DRAFT_ACTION_PREFIX = "draft_action";
export const DRAFT_PROPOSAL_MODAL_CALLBACK_ID = "draft_proposal_modal";

export type DraftSkeletonForCard = {
  id: string;
  companyName: string;
  contactName: string;
  contactJobTitle: string | null;
  researchSummary: string;
  problemHypothesis: string;
  body: string;
};

/** 초안 스켈레톤을 Slack에 게시하고, 사람이 프로젝트 제안을 채울 모달을 여는 버튼을 붙인다. */
export async function postDraftSkeletonCard(draft: DraftSkeletonForCard) {
  if (!SLACK_APPROVAL_CHANNEL_ID) {
    throw new Error("SLACK_APPROVAL_CHANNEL_ID 환경변수가 설정되지 않았습니다.");
  }

  await slackClient.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text: `${draft.companyName} - ${draft.contactName} 메시지 초안 준비됨`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `📝 ${draft.companyName} → ${draft.contactName} 메시지 초안` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*대상*: ${draft.contactName}${draft.contactJobTitle ? ` (${draft.contactJobTitle})` : ""}\n\n` +
            `*사전조사 요약*\n${draft.researchSummary}\n\n` +
            `*문제 가설*\n${draft.problemHypothesis}`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*초안 본문*\n\`\`\`\n${draft.body}\n\`\`\`` },
      },
      {
        type: "actions",
        block_id: `draft:${draft.id}`,
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "✍️ 프로젝트 제안 작성/수정" },
            action_id: `${DRAFT_ACTION_PREFIX}:open_modal:${draft.id}`,
            value: draft.id,
          },
        ],
      },
    ],
  });
}
