import { SLACK_APPROVAL_CHANNEL_ID, slackClient } from "../client";

// Inngest의 step.run() 결과는 JSON으로 직렬화되어 Date 필드가 string으로 바뀌므로,
// Prisma의 전체 모델 타입 대신 카드 렌더링에 실제로 쓰는 필드만 최소한으로 요구한다.
export type RunCompanyWithCompany = {
  id: string;
  fitScore: number | null;
  recommendationReason: string | null;
  uncertainty: string | null;
  company: {
    name: string;
    domain: string;
    industry: string | null;
    fundingStage: string | null;
    employeeCount: number | null;
  };
};

/** Block Kit 액션 버튼의 action_id 네임스페이스. */
export const COMPANY_DECISION_ACTION_PREFIX = "company_decision";

function buildCompanyCardBlocks(rc: RunCompanyWithCompany) {
  const { company } = rc;
  const fitScoreText = rc.fitScore !== null ? `${Math.round(rc.fitScore * 100)}%` : "정보 없음";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${company.name}* (${company.domain})\n` +
          `업종: ${company.industry ?? "미확인"} · 투자단계: ${company.fundingStage ?? "미확인"} · ` +
          `임직원수: ${company.employeeCount ?? "미확인"}\n` +
          `적합도: *${fitScoreText}*\n` +
          `추천 근거: ${rc.recommendationReason ?? "-"}\n` +
          (rc.uncertainty ? `⚠️ 불확실한 정보: ${rc.uncertainty}` : ""),
      },
    },
    {
      type: "actions",
      block_id: `run_company:${rc.id}`,
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "승인" },
          action_id: `${COMPANY_DECISION_ACTION_PREFIX}:approve:${rc.id}`,
          value: rc.id,
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "거절" },
          action_id: `${COMPANY_DECISION_ACTION_PREFIX}:reject:${rc.id}`,
          value: rc.id,
        },
      ],
    },
    { type: "divider" },
  ];
}

/**
 * 승인 게이트 1: 후보 기업 목록을 Slack에 카드 형태로 게시한다.
 * 각 카드의 승인/거절은 클릭 즉시 DB에 기록되고(app.ts의 액션 핸들러),
 * 담당자가 전체를 다 훑은 뒤 마지막 "제출 완료" 버튼을 눌러야
 * durable workflow(outreach-run.ts)가 재개된다.
 */
export async function postCompanyApprovalCards(runId: string, candidates: RunCompanyWithCompany[]) {
  if (!SLACK_APPROVAL_CHANNEL_ID) {
    throw new Error("SLACK_APPROVAL_CHANNEL_ID 환경변수가 설정되지 않았습니다.");
  }

  await slackClient.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text: `새 기업 후보 ${candidates.length}건이 승인 대기 중입니다.`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `기업 후보 승인 (${candidates.length}건)` },
      },
    ],
  });

  for (const rc of candidates) {
    await slackClient.chat.postMessage({
      channel: SLACK_APPROVAL_CHANNEL_ID,
      text: `${rc.company.name} 후보 검토`,
      blocks: buildCompanyCardBlocks(rc),
    });
  }

  await slackClient.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text: "모든 후보를 검토했다면 완료 버튼을 눌러주세요.",
    blocks: [
      {
        type: "actions",
        block_id: `run_submit:${runId}`,
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "✅ 검토 완료 (다음 단계로)" },
            action_id: `${COMPANY_DECISION_ACTION_PREFIX}:submit:${runId}`,
            value: runId,
          },
        ],
      },
    ],
  });
}
