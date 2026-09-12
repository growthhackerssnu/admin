import { SLACK_APPROVAL_CHANNEL_ID, slackClient } from "../client";

export const CONTACT_DECISION_ACTION_PREFIX = "contact_decision";

const ROLE_LABEL: Record<string, string> = {
  DECISION_MAKER: "의사결정권자",
  PRACTITIONER: "실무자",
  CHAMPION: "챔피언",
};

export type ContactCandidateWithDetails = {
  id: string;
  roleType: string;
  roleFitScore: number | null;
  contactabilityScore: number | null;
  recommendationReason: string | null;
  contact: {
    name: string;
    jobTitle: string | null;
    profileUrl: string | null;
    contactMethods: { type: string; value: string; confidence: number }[];
  };
};

function buildCandidateBlocks(rc: { id: string; company: { name: string; domain: string } }, candidate: ContactCandidateWithDetails) {
  const { contact } = candidate;
  const methodsText =
    contact.contactMethods.length > 0
      ? contact.contactMethods
          .map((m) => `${m.type}: ${m.value} (신뢰도 ${Math.round(m.confidence * 100)}%)`)
          .join(" · ")
      : "확인된 연락처 없음";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*[${rc.company.name}] ${ROLE_LABEL[candidate.roleType] ?? candidate.roleType}: ${contact.name}*` +
          (contact.jobTitle ? ` (${contact.jobTitle})` : "") +
          (contact.profileUrl ? ` — <${contact.profileUrl}|프로필>` : "") +
          `\n역할 적합도: *${candidate.roleFitScore !== null ? Math.round(candidate.roleFitScore * 100) + "%" : "정보 없음"}* · ` +
          `연락 가능성: *${candidate.contactabilityScore !== null ? Math.round(candidate.contactabilityScore * 100) + "%" : "정보 없음"}*\n` +
          `추천 이유: ${candidate.recommendationReason ?? "-"}\n` +
          `연락처: ${methodsText}`,
      },
    },
    {
      type: "actions",
      block_id: `contact_candidate:${candidate.id}`,
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "선택" },
          action_id: `${CONTACT_DECISION_ACTION_PREFIX}:select:${candidate.id}`,
          value: candidate.id,
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "제외" },
          action_id: `${CONTACT_DECISION_ACTION_PREFIX}:reject:${candidate.id}`,
          value: candidate.id,
        },
      ],
    },
    { type: "divider" },
  ];
}

/** 승인 게이트 2: 회사별 담당자 후보를 Slack 카드로 게시한다. */
export async function postContactApprovalCards(
  runId: string,
  runCompanies: { id: string; company: { name: string; domain: string }; contactCandidates: ContactCandidateWithDetails[] }[],
) {
  if (!SLACK_APPROVAL_CHANNEL_ID) {
    throw new Error("SLACK_APPROVAL_CHANNEL_ID 환경변수가 설정되지 않았습니다.");
  }

  const totalCandidates = runCompanies.reduce((sum, rc) => sum + rc.contactCandidates.length, 0);

  await slackClient.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text: `담당자 후보 ${totalCandidates}건이 승인 대기 중입니다.`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `담당자 후보 검토 (기업 ${runCompanies.length}곳)` },
      },
    ],
  });

  for (const rc of runCompanies) {
    if (rc.contactCandidates.length === 0) {
      await slackClient.chat.postMessage({
        channel: SLACK_APPROVAL_CHANNEL_ID,
        text: `⚠️ ${rc.company.name}: 공개된 담당자 정보를 찾지 못했습니다.`,
      });
      continue;
    }
    for (const candidate of rc.contactCandidates) {
      await slackClient.chat.postMessage({
        channel: SLACK_APPROVAL_CHANNEL_ID,
        text: `${rc.company.name} - ${candidate.contact.name} 후보 검토`,
        blocks: buildCandidateBlocks(rc, candidate),
      });
    }
  }

  await slackClient.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text: "모든 담당자 후보를 검토했다면 완료 버튼을 눌러주세요.",
    blocks: [
      {
        type: "actions",
        block_id: `contact_submit:${runId}`,
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "✅ 검토 완료 (다음 단계로)" },
            action_id: `${CONTACT_DECISION_ACTION_PREFIX}:submit:${runId}`,
            value: runId,
          },
        ],
      },
    ],
  });
}
