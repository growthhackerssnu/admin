import { inngest } from "../inngest/client";
import { runForgottenCompanyRescan } from "../modules/rescan/pipeline";
import { slackClient, SLACK_APPROVAL_CHANNEL_ID } from "../slack/client";

/**
 * Phase 5-2: 매달 1일 자정(KST)에 쿨다운이 끝난 과거 후보를 재조사한다. 테스트/수동
 * 실행을 위해 `dhbot/forgotten.rescan.requested` 이벤트로도 같은 함수를 트리거할 수
 * 있게 해둔다(Slack `/dhbot-rescan` 커맨드가 이 이벤트를 보낸다).
 */
export const forgottenCompanyRescan = inngest.createFunction(
  { id: "forgotten-company-rescan", name: "Forgotten Company Rescan" },
  [{ cron: "TZ=Asia/Seoul 0 0 1 * *" }, { event: "dhbot/forgotten.rescan.requested" }],
  async ({ step }) => {
    const { runId, count } = await runForgottenCompanyRescan(step);

    if (!runId) {
      await step.run("notify-no-candidates", () =>
        slackClient.chat.postMessage({
          channel: SLACK_APPROVAL_CHANNEL_ID,
          text: "🔁 잊혀진 기업 재조사를 실행했지만, 쿨다운이 끝난 후보가 없었거나 재평가를 통과한 기업이 없었습니다.",
        }),
      );
      return { status: "no_candidates_resurfaced", count };
    }

    // RunCompany가 이미 채워져 있으므로, outreach-run은 소싱 단계를 건너뛰고
    // 곧바로 승인 카드 게시부터 이어간다(Phase 2~4 로직을 그대로 재사용).
    await step.sendEvent("trigger-outreach-run", {
      name: "dhbot/run.sourcing.requested",
      data: { runId },
    });

    return { status: "rescanned", runId, count };
  },
);
