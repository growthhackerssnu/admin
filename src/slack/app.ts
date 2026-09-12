import { App } from "@slack/bolt";
import { VercelReceiver } from "@vercel/slack-bolt";
import { prisma } from "../lib/prisma";
import { inngest } from "../inngest/client";
import { COMPANY_DECISION_ACTION_PREFIX } from "./blocks/companyApprovalCard";
import { COMPANY_REJECT_MODAL_CALLBACK_ID, buildCompanyRejectModal } from "./blocks/companyRejectModal";
import { CONTACT_DECISION_ACTION_PREFIX } from "./blocks/contactApprovalCard";
import { DRAFT_ACTION_PREFIX, DRAFT_PROPOSAL_MODAL_CALLBACK_ID } from "./blocks/messageDraftCard";
import { REPLY_MODAL_CALLBACK_ID, REPLY_INTENT_LABEL, buildReplyModal } from "./blocks/replyModal";
import { SLACK_APPROVAL_CHANNEL_ID } from "./client";
import { PROPOSAL_PLACEHOLDER } from "../modules/drafting/generateDraft";
import { createReplyDraft, findOutreachTargetsByQuery } from "../modules/reply/persistReply";
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

/**
 * 승인 버튼: 클릭 즉시 COMPANY_DECISION에 기록한다.
 * 거절 버튼: 사유를 물어보는 모달을 연다(company_reject_modal 핸들러에서 실제 기록).
 * trigger_id는 3초 안에 써야 하므로, 거절 시 DB 작업 없이 곧바로 모달만 연다.
 */
slackApp.action(
  new RegExp(`^${COMPANY_DECISION_ACTION_PREFIX}:(approve|reject):.+$`),
  async ({ ack, action, body, respond, client }) => {
    await ack();
    if (action.type !== "button" || !("action_id" in action)) return;

    const [, decision, runCompanyId] = action.action_id.split(":");
    if (!runCompanyId) return;

    if (decision === "reject") {
      if (!("trigger_id" in body)) return;
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildCompanyRejectModal(runCompanyId),
      });
      return;
    }

    const decidedBy = body.user.id;
    await prisma.$transaction([
      prisma.runCompany.update({ where: { id: runCompanyId }, data: { status: "APPROVED" } }),
      prisma.companyDecision.create({ data: { runCompanyId, action: "APPROVE", decidedBy } }),
    ]);

    await respond({ response_type: "ephemeral", text: "✅ 승인으로 기록했습니다." });
  },
);

/** 거절 사유 모달 제출: 분류(영구제외/쿨다운)와 상세 사유를 반영해 기록한다. */
slackApp.view(COMPANY_REJECT_MODAL_CALLBACK_ID, async ({ ack, view, body, client }) => {
  await ack();

  const runCompanyId = view.private_metadata;
  const category = view.state.values.category_block?.category_select?.selected_option?.value as
    | "PERMANENT_DISQUALIFY"
    | "COOLDOWN_ELIGIBLE"
    | undefined;
  const rejectionReason = view.state.values.reason_block?.reason_input?.value || null;
  const decidedBy = body.user.id;

  const cooldownClass = category ?? "COOLDOWN_ELIGIBLE";
  let cooldownUntil: Date | null = null;
  if (cooldownClass === "COOLDOWN_ELIGIBLE") {
    cooldownUntil = new Date();
    cooldownUntil.setDate(cooldownUntil.getDate() + DEFAULT_REJECTION_COOLDOWN_DAYS);
  }

  await prisma.$transaction([
    prisma.runCompany.update({ where: { id: runCompanyId }, data: { status: "REJECTED" } }),
    prisma.companyDecision.create({
      data: { runCompanyId, action: "REJECT", decidedBy, rejectionReason, cooldownClass, cooldownUntil },
    }),
  ]);

  const categoryLabel = cooldownClass === "PERMANENT_DISQUALIFY" ? "영구 제외" : "재조사 가능(쿨다운 후)";
  await client.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text:
      `❌ ${decidedBy}님이 거절 사유를 기록했습니다 — *${categoryLabel}*` +
      (rejectionReason ? `\n> ${rejectionReason}` : ""),
  });
});

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

    // "다음 단계로 진행합니다"는 승인된 기업이 있을 때만 사실이다 — 전부 거절이면
    // 워크플로우가 여기서 그대로 종료되므로, 실제 결과에 맞는 메시지를 보여준다.
    const approvedCount = await prisma.runCompany.count({ where: { runId, status: "APPROVED" } });
    const text =
      approvedCount > 0
        ? `제출 완료 — ${decidedBy}님이 기업 후보 검토를 마쳤습니다. 승인된 ${approvedCount}곳에 대해 담당자 발굴을 시작합니다.`
        : `제출 완료 — ${decidedBy}님이 기업 후보 검토를 마쳤습니다. 승인된 기업이 없어 이번 실행은 여기서 종료됩니다.`;

    await respond({ response_type: "in_channel", text });
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

    // 선택된 담당자가 한 명도 없으면 전부 예외 큐로 빠지고 초안 생성 없이 종료된다 —
    // 그 경우엔 "다음 단계로 진행"이 아니라 종료된다고 정확히 알려준다.
    const selectedCount = await prisma.contactCandidate.count({
      where: { researchAttempt: { runCompany: { runId } }, status: "SELECTED" },
    });
    const text =
      selectedCount > 0
        ? `제출 완료 — ${decidedBy}님이 담당자 후보 검토를 마쳤습니다. 선택된 담당자 ${selectedCount}명에 대해 메시지 초안을 생성합니다.`
        : `제출 완료 — ${decidedBy}님이 담당자 후보 검토를 마쳤습니다. 선택된 담당자가 없어 이번 실행은 여기서 종료됩니다.`;

    await respond({ response_type: "in_channel", text });
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

/**
 * Phase 5-1: 담당자로부터 받은 답장 원문을 사람이 그대로 붙여넣으면, 의도를 분류하고
 * 그에 맞는 답신 초안을 만들어준다. 이메일함 연동 없이 가장 단순한 방식으로 시작한다 —
 * 사람이 답장을 어디서 받았든(메일, 문자 등) 원문만 복사해 오면 된다.
 */
slackApp.command("/dhbot-reply", async ({ ack, body, client }) => {
  await ack();

  // trigger_id는 3초 안에 views.open을 호출해야 유효하다 — DB 조회 없이 즉시 연다.
  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildReplyModal(),
  });
});

/** 답장 초안 모달 제출: 회사/담당자 텍스트로 대상을 찾고, 의도 분류 + 답신 초안을 생성해 채널에 게시한다. */
slackApp.view(REPLY_MODAL_CALLBACK_ID, async ({ ack, view, body, client }) => {
  await ack();

  const targetQuery = view.state.values.target_search_block?.target_search_input?.value;
  const incomingText = view.state.values.reply_text_block?.reply_text_input?.value;
  const decidedBy = body.user.id;
  if (!targetQuery || !incomingText) return;

  const matches = await findOutreachTargetsByQuery(targetQuery);
  const [target] = matches;
  if (!target) {
    await client.chat.postEphemeral({
      channel: SLACK_APPROVAL_CHANNEL_ID,
      user: decidedBy,
      text: `"${targetQuery}"와 일치하는 발송 확정된 대상을 찾지 못했습니다. 회사명이나 담당자명을 다시 확인해주세요.`,
    });
    return;
  }
  const ambiguityNote =
    matches.length > 1
      ? `\n⚠️ "${targetQuery}"로 ${matches.length}건이 매칭되어 가장 최근 것(${target.label})을 사용했습니다.`
      : "";

  const result = await createReplyDraft({
    contactCandidateId: target.contactCandidateId,
    incomingText,
    createdBy: decidedBy,
  });

  if (!result) {
    await client.chat.postMessage({
      channel: SLACK_APPROVAL_CHANNEL_ID,
      text: `⚠️ ${decidedBy}님이 요청한 답장 초안 생성에 실패했습니다. 다시 시도해주세요.`,
    });
    return;
  }

  await client.chat.postMessage({
    channel: SLACK_APPROVAL_CHANNEL_ID,
    text: `${decidedBy}님이 ${target.label} 답장 초안을 요청했습니다.`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*대상*: ${target.label}${ambiguityNote}\n` +
            `*답장 분류*: ${REPLY_INTENT_LABEL[result.intent] ?? result.intent}\n\n` +
            `*받은 원문*\n>${incomingText.replace(/\n/g, "\n>")}`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*답신 초안 (검토 후 직접 발송하세요)*\n\`\`\`\n${result.draftBody}\n\`\`\`` },
      },
    ],
  });
});

/**
 * Phase 5-2: 매달 1일 자동 실행되는 잊혀진 기업 재조사를 수동으로도 즉시 트리거한다
 * (매달 기다리지 않고 테스트/필요 시 바로 돌려볼 수 있도록).
 */
slackApp.command("/dhbot-rescan", async ({ ack, respond }) => {
  await ack();

  await inngest.send({ name: "dhbot/forgotten.rescan.requested", data: {} });

  await respond({
    response_type: "ephemeral",
    text: "쿨다운이 끝난 기업 재조사를 시작했습니다. 재조사를 통과한 후보가 있으면 잠시 후 승인 카드가 게시됩니다.",
  });
});

/**
 * 매일 새벽 자동 실행되는 Google Sheets 이력 백업을 수동으로도 즉시 트리거한다.
 */
slackApp.command("/dhbot-backup", async ({ ack, respond }) => {
  await ack();

  await inngest.send({ name: "dhbot/history.backup.requested", data: {} });

  await respond({
    response_type: "ephemeral",
    text: "Google Sheets 이력 백업을 시작했습니다.",
  });
});
