import { App } from "@slack/bolt";
import { VercelReceiver } from "@vercel/slack-bolt";
import { prisma } from "../lib/prisma";
import { inngest } from "../inngest/client";
import { COMPANY_DECISION_ACTION_PREFIX } from "./blocks/companyApprovalCard";
import { CONTACT_DECISION_ACTION_PREFIX } from "./blocks/contactApprovalCard";
import { DRAFT_ACTION_PREFIX, DRAFT_PROPOSAL_MODAL_CALLBACK_ID } from "./blocks/messageDraftCard";
import { SLACK_APPROVAL_CHANNEL_ID } from "./client";
import { PROPOSAL_PLACEHOLDER } from "../modules/drafting/generateDraft";
import { getProjectListReference } from "../lib/notion";
import { seedDummyWorkflowRun } from "../dev/seedDummyRun";
import { ensureDefaultWorkflowConfig } from "../modules/sourcing/defaultConfig";
import { DEFAULT_REJECTION_COOLDOWN_DAYS } from "../config/ttl";

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

    const cooldownUntil = new Date();
    cooldownUntil.setDate(cooldownUntil.getDate() + DEFAULT_REJECTION_COOLDOWN_DAYS);

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
          // 거절 사유 분류 모달이 생기기 전까지는 기본값으로 재조사 가능한 쿨다운만 적용한다.
          cooldownClass: approved ? undefined : "COOLDOWN_ELIGIBLE",
          cooldownUntil: approved ? undefined : cooldownUntil,
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

/** 담당자 선택/제외 버튼: 클릭 즉시 CONTACT_DECISION에 기록하고, CONTACT_CANDIDATE 상태를 갱신한다. */
slackApp.action(
  new RegExp(`^${CONTACT_DECISION_ACTION_PREFIX}:(select|reject):.+$`),
  async ({ ack, action, body, respond }) => {
    await ack();
    if (action.type !== "button" || !("action_id" in action)) return;

    const [, decision, contactCandidateId] = action.action_id.split(":");
    if (!contactCandidateId) return;
    const selected = decision === "select";
    const decidedBy = body.user.id;

    await prisma.$transaction([
      prisma.contactCandidate.update({
        where: { id: contactCandidateId },
        data: { status: selected ? "SELECTED" : "REJECTED" },
      }),
      prisma.contactDecision.create({
        data: {
          contactCandidateId,
          action: selected ? "APPROVE" : "REJECT",
          decidedBy,
        },
      }),
    ]);

    await respond({
      response_type: "ephemeral",
      text: selected ? "✅ 선택으로 기록했습니다." : "❌ 제외로 기록했습니다.",
    });
  },
);

/** "검토 완료" 버튼: 담당자 결정을 확정하고 durable workflow를 재개시키는 배치 이벤트를 발행한다. */
slackApp.action(
  new RegExp(`^${CONTACT_DECISION_ACTION_PREFIX}:submit:.+$`),
  async ({ ack, action, body, respond }) => {
    await ack();
    if (action.type !== "button" || !("action_id" in action)) return;

    const runId = action.value;
    if (!runId) return;

    const decidedBy = body.user.id;

    await inngest.send({
      name: "dhbot/contact.decision.batch",
      data: { runId, decidedBy },
    });

    await respond({
      response_type: "in_channel",
      text: `제출 완료 — ${decidedBy}님이 담당자 후보 검토를 마쳤습니다. 다음 단계로 진행합니다.`,
    });
  },
);

/** "프로젝트 제안 작성/수정" 버튼: 제안 내용을 입력받을 모달을 연다. */
slackApp.action(
  new RegExp(`^${DRAFT_ACTION_PREFIX}:open_modal:.+$`),
  async ({ ack, action, body, client }) => {
    await ack();
    if (action.type !== "button" || !("action_id" in action)) return;

    const [, , draftId] = action.action_id.split(":");
    if (!draftId || !("trigger_id" in body)) return;

    const draft = await prisma.messageDraft.findUniqueOrThrow({ where: { id: draftId } });
    const { url: projectListUrl } = await getProjectListReference();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: DRAFT_PROPOSAL_MODAL_CALLBACK_ID,
        private_metadata: draftId,
        title: { type: "plain_text", text: "프로젝트 제안 작성" },
        submit: { type: "plain_text", text: "저장" },
        close: { type: "plain_text", text: "취소" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `참고할 학회 프로젝트 목록: <${projectListUrl}|Notion에서 보기>`,
            },
          },
          {
            type: "input",
            block_id: "proposal_block",
            label: { type: "plain_text", text: "프로젝트 제안 내용" },
            element: {
              type: "plain_text_input",
              action_id: "proposal_input",
              multiline: true,
              initial_value: draft.proposalInput ?? "",
            },
          },
        ],
      },
    });
  },
);

/** 모달 제출: 제안 내용을 반영한 최종본을 새 버전으로 저장하고, 복사해서 보낼 수 있게 채널에 올린다. */
slackApp.view(DRAFT_PROPOSAL_MODAL_CALLBACK_ID, async ({ ack, view, body, client }) => {
  await ack();

  const draftId = view.private_metadata;
  const proposalInput = view.state.values.proposal_block?.proposal_input?.value ?? "";
  const decidedBy = body.user.id;

  const previous = await prisma.messageDraft.findUniqueOrThrow({ where: { id: draftId } });
  const finalBody = previous.body ? previous.body.replace(PROPOSAL_PLACEHOLDER, proposalInput) : proposalInput;

  const newDraft = await prisma.messageDraft.create({
    data: {
      runCompanyId: previous.runCompanyId,
      contactCandidateId: previous.contactCandidateId,
      version: previous.version + 1,
      researchSummary: previous.researchSummary,
      problemHypothesis: previous.problemHypothesis,
      proposalInput,
      body: finalBody,
      status: "FINALIZED",
    },
  });

  await client.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text: `✅ ${decidedBy}님이 제안을 작성했습니다 — 아래 메시지를 복사해서 직접 전송하세요.`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*최종 메시지 (v${newDraft.version})*\n\`\`\`\n${finalBody}\n\`\`\`` },
      },
    ],
  });
});

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

/**
 * 실제 소싱 파이프라인을 태우는 프로덕션 트리거. RUN_COMPANY를 미리 채우지 않고
 * 빈 WorkflowRun만 만들어 이벤트를 발행하면, durable workflow가 실제 뉴스 피드 수집 →
 * 규칙 기반 필터 → Claude(web_search) 평가 → 중복/쿨다운 게이팅을 거쳐 후보를 채운다.
 * 실제 웹 검색·LLM 호출이 여러 번 일어나므로 몇 분 정도 걸릴 수 있다.
 */
slackApp.command("/dhbot-run", async ({ ack, respond }) => {
  await ack();

  const config = await ensureDefaultWorkflowConfig();

  const run = await prisma.workflowRun.create({
    data: {
      configId: config.id,
      criteriaSnapshot: {
        industry: config.industry,
        fundingStage: config.fundingStage,
        headcountMin: config.headcountMin,
        headcountMax: config.headcountMax,
      },
      status: "PENDING",
    },
  });

  await inngest.send({
    name: "dhbot/run.sourcing.requested",
    data: { runId: run.id },
  });

  await respond({
    response_type: "ephemeral",
    text: `실제 소싱을 시작했습니다 (runId: ${run.id}). 뉴스 피드 수집과 기업 리서치에 몇 분 정도 걸릴 수 있어요 — 끝나면 승인 카드가 게시됩니다.`,
  });
});
