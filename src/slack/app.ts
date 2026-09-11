import { App } from "@slack/bolt";
import { VercelReceiver } from "@vercel/slack-bolt";
import { prisma } from "../lib/prisma";
import { inngest } from "../inngest/client";
import { COMPANY_DECISION_ACTION_PREFIX } from "./blocks/companyApprovalCard";
import { seedDummyWorkflowRun } from "../dev/seedDummyRun";

// 일반 HTTPReceiver는 Vercel 서버리스 환경에서 ack() 이후 코드가 응답과 함께
// 잘려나가는 문제가 있어(processBeforeResponse로도 완전히 해결되지 않음),
// Vercel이 자체 배포한 어댑터를 쓴다. waitUntil로 리스너가 끝까지 실행되도록 보장한다.
export const receiver = new VercelReceiver();

export const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true,
});

slackApp.error(async (error) => {
  console.error("[bolt] unhandled error", error);
});

/** 승인/거절 버튼: 클릭 즉시 COMPANY_DECISION에 기록하고, RUN_COMPANY 상태를 갱신한다. */
slackApp.action(
  new RegExp(`^${COMPANY_DECISION_ACTION_PREFIX}:(approve|reject):.+$`),
  async ({ ack, action, body, respond }) => {
    await ack();
    if (action.type !== "button" || !("action_id" in action)) return;

    const [, decision, runCompanyId] = action.action_id.split(":");
    if (!runCompanyId) return;
    const approved = decision === "approve";
    const decidedBy = body.user.id;

    await prisma.$transaction([
      prisma.runCompany.update({
        where: { id: runCompanyId },
        data: { status: approved ? "APPROVED" : "REJECTED" },
      }),
      prisma.companyDecision.create({
        data: {
          runCompanyId,
          action: approved ? "APPROVE" : "REJECT",
          decidedBy,
        },
      }),
    ]);

    await respond({
      response_type: "ephemeral",
      text: approved ? "✅ 승인으로 기록했습니다." : "❌ 거절로 기록했습니다. (거절 사유는 추후 모달로 수집)",
    });
  },
);

/** "검토 완료" 버튼: 이 런의 모든 결정을 확정하고 durable workflow를 재개시키는 배치 이벤트를 발행한다. */
slackApp.action(
  new RegExp(`^${COMPANY_DECISION_ACTION_PREFIX}:submit:.+$`),
  async ({ ack, action, body, respond }) => {
    await ack();
    if (action.type !== "button" || !("action_id" in action)) return;

    const runId = action.value;
    if (!runId) return;

    const decidedBy = body.user.id;

    await inngest.send({
      name: "dhbot/company.decision.batch",
      data: { runId, decidedBy },
    });

    await respond({
      response_type: "in_channel",
      text: `제출 완료 — ${decidedBy}님이 기업 후보 검토를 마쳤습니다. 다음 단계로 진행합니다.`,
    });
  },
);

/**
 * Phase 1 테스트용 슬래시 커맨드: 더미 WorkflowConfig/WorkflowRun/RunCompany를 만들고
 * outreach-run durable workflow를 트리거한다. 실제 소싱 파이프라인은 Phase 2에서 이 자리를 대체한다.
 */
slackApp.command("/dhbot-run-test", async ({ ack, respond }) => {
  await ack();

  const { runId } = await seedDummyWorkflowRun();

  await inngest.send({
    name: "dhbot/run.sourcing.requested",
    data: { runId },
  });

  await respond({
    response_type: "ephemeral",
    text: `더미 실행을 시작했습니다 (runId: ${runId}). 잠시 후 승인 카드가 게시됩니다.`,
  });
});
