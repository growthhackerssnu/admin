// 그핵드인 Slack 앱(slack-app-ghedin)으로 수정 요청 알림을 보내고, 알림의 승인·반려 버튼을
// 처리한다. 버튼은 승인 큐(/hr/admin)와 같은 approveEditRequest/rejectEditRequest를 부른다 —
// 그래서 Slack에서 누른 결과가 그대로 어드민 화면에 보인다.
//
// 필요한 환경 변수(둘 다 api.slack.com/apps → 그핵드인):
//   SLACK_GHEDIN_BOT_TOKEN      OAuth & Permissions → Bot User OAuth Token(xoxb-)
//   SLACK_GHEDIN_SIGNING_SECRET Basic Information → Signing Secret
// 봇 토큰이 없으면 예전처럼 SLACK_EDIT_REQUEST_WEBHOOK_URL(워크플로 웹후크, 버튼 없음)로 보낸다.
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { memberWithOpsRoles, type MemberWithOpsRoles } from "@/portal/lib/opsRoles";

// #pr-알럼-업데이트
export const EDIT_REQUEST_CHANNEL_ID = process.env.SLACK_EDIT_REQUEST_CHANNEL_ID ?? "C0C6ZL5GF62";
// PR 팀 사용자 그룹
const PR_TEAM_MENTION = "<!subteam^S0BDF7JAJ49>";
const QUEUE_URL = "https://admin.ghsnu.com/hr/admin";

export const APPROVE_ACTION = "edit_request_approve";
export const REJECT_ACTION = "edit_request_reject";
export const REJECT_VIEW = "edit_request_reject";

type SlackResponse = { ok: boolean; error?: string; [key: string]: unknown };

export async function slackApi(method: string, body: Record<string, unknown>): Promise<SlackResponse> {
  const token = process.env.SLACK_GHEDIN_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_GHEDIN_BOT_TOKEN not set" };
  // users.info는 JSON 본문의 인자를 무시하므로 폼으로 보낸다.
  const form = method === "users.info";
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(form ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: form
      ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
      : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const result = (await response.json()) as SlackResponse;
  if (!result.ok) console.warn(`[slack:ghedin] ${method}: ${result.error}`);
  return result;
}

// Slack 서명 검증(https://api.slack.com/authentication/verifying-requests-from-slack).
// 5분보다 오래된 요청은 재전송 공격으로 보고 거절한다.
export function verifySlackSignature(rawBody: string, headers: Headers, now = Date.now()): boolean {
  const secret = process.env.SLACK_GHEDIN_SIGNING_SECRET;
  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 60 * 5) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

// 버튼을 누른 Slack 사용자의 이메일로 회원을 찾는다(앱에 users:read.email 권한 필요).
export async function memberOfSlackUser(userId: string): Promise<MemberWithOpsRoles | null> {
  const info = (await slackApi("users.info", { user: userId })) as SlackResponse & {
    user?: { profile?: { email?: string } };
  };
  const email = info.user?.profile?.email;
  if (!email) return null;
  return prisma.member.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, active: true },
    include: memberWithOpsRoles,
  });
}

export type EditRequestSummary = { id: string; name: string; changed: string[] };

function summaryBlocks({ name, changed }: EditRequestSummary) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${PR_TEAM_MENTION} :pencil2: *${name}*님이 그핵드인 프로필 수정을 요청했습니다.\n바뀐 항목: ${changed.join(", ")}\n<${QUEUE_URL}|승인 큐에서 자세히 보기>`,
      },
    },
  ];
}

export function pendingMessage(summary: EditRequestSummary) {
  return {
    text: `${summary.name}님이 그핵드인 프로필 수정을 요청했습니다.`,
    blocks: [
      ...summaryBlocks(summary),
      {
        type: "actions",
        block_id: "review",
        elements: [
          {
            type: "button",
            action_id: APPROVE_ACTION,
            value: summary.id,
            style: "primary",
            text: { type: "plain_text", text: "승인" },
            // 승인하면 바로 Notion 프로필이 바뀐다 — 실수로 누르지 않게 한 번 더 묻는다.
            confirm: {
              title: { type: "plain_text", text: "수정 요청 승인" },
              text: { type: "mrkdwn", text: `*${summary.name}*님의 Notion 프로필에 바로 반영됩니다.` },
              confirm: { type: "plain_text", text: "승인" },
              deny: { type: "plain_text", text: "취소" },
            },
          },
          {
            type: "button",
            action_id: REJECT_ACTION,
            value: summary.id,
            style: "danger",
            text: { type: "plain_text", text: "반려" },
          },
        ],
      },
    ],
  };
}

// 처리된 요청: 버튼을 지우고 누가 어떻게 처리했는지 남긴다.
export function resolvedMessage(
  summary: EditRequestSummary,
  outcome: { status: "approved" | "rejected"; reviewer: string; reviewNote?: string | null },
) {
  const label = outcome.status === "approved" ? ":white_check_mark: 승인됨" : ":leftwards_arrow_with_hook: 반려됨";
  const note = outcome.reviewNote ? ` — ${outcome.reviewNote}` : "";
  return {
    text: `${summary.name}님의 그핵드인 프로필 수정 요청이 ${outcome.status === "approved" ? "승인" : "반려"}되었습니다.`,
    blocks: [
      ...summaryBlocks(summary),
      { type: "context", elements: [{ type: "mrkdwn", text: `${label} · ${outcome.reviewer}${note}` }] },
    ],
  };
}

export function rejectModal(privateMetadata: string, name: string) {
  return {
    type: "modal",
    callback_id: REJECT_VIEW,
    private_metadata: privateMetadata,
    title: { type: "plain_text", text: "수정 요청 반려" },
    submit: { type: "plain_text", text: "반려" },
    close: { type: "plain_text", text: "취소" },
    blocks: [
      {
        type: "input",
        block_id: "reason",
        label: { type: "plain_text", text: `${name}님에게 보일 반려 사유` },
        element: { type: "plain_text_input", action_id: "value", multiline: true },
      },
    ],
  };
}

// 요청자 이름·기수(승인 큐와 같은 core.people_directory 값)와 바뀐 항목 목록.
const SECTION_LABELS: Record<string, string> = { careers: "커리어", activities: "활동", projects: "프로젝트" };

export async function summarizeEditRequest(editRequestId: string): Promise<EditRequestSummary | null> {
  const row = await prisma.editRequest.findUnique({
    where: { id: editRequestId },
    include: { requester: { include: { claimedPersonEntry: true } } },
  });
  if (!row) return null;
  const person = row.requester.claimedPersonEntry;
  const name = `${person?.cohort != null ? `${person.cohort}기 ` : ""}${person?.name ?? row.requester.displayName ?? "이름 미상"}`;
  const { structuredFields = {}, freeTextSections = {} } = row.diff as {
    structuredFields?: Record<string, unknown>;
    freeTextSections?: Record<string, unknown>;
  };
  const changed = [...Object.keys(structuredFields), ...Object.keys(freeTextSections).map((k) => SECTION_LABELS[k] ?? k)];
  return { id: row.id, name, changed };
}

// 새 수정 요청 알림. Slack이 실패해도 제출 자체는 성공으로 둔다.
export async function notifyEditRequest(editRequestId: string) {
  const summary = await summarizeEditRequest(editRequestId);
  if (!summary) return;
  if (process.env.SLACK_GHEDIN_BOT_TOKEN) {
    await slackApi("chat.postMessage", { channel: EDIT_REQUEST_CHANNEL_ID, ...pendingMessage(summary) }).catch((error) =>
      console.error("[slack:ghedin] edit request notify failed", error),
    );
    return;
  }
  const url = process.env.SLACK_EDIT_REQUEST_WEBHOOK_URL;
  if (!url) return;
  const text = `${PR_TEAM_MENTION} :pencil2: *${summary.name}*님이 그핵드인 프로필 수정을 요청했습니다.\n바뀐 항목: ${summary.changed.join(", ")}\n<${QUEUE_URL}|승인 큐 열기>`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(3000),
  }).catch((error) => console.error("[slack] edit request notify failed", error));
}
