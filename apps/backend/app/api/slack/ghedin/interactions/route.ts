import { NextResponse } from "next/server";
import { canReviewEditRequests } from "@/hr/lib/auth";
import { approveEditRequest, rejectEditRequest } from "@/hr/lib/editRequestApproval";
import { ApiError } from "@/hr/lib/errors";
import {
  APPROVE_ACTION,
  REJECT_ACTION,
  REJECT_VIEW,
  memberOfSlackUser,
  pendingMessage,
  rejectModal,
  resolvedMessage,
  slackApi,
  summarizeEditRequest,
  verifySlackSignature,
} from "@/hr/lib/slack";
import { prisma } from "@/lib/prisma";

// 그핵드인 Slack 앱(slack-app-ghedin)의 Interactivity 수신점. 수정 요청 알림의 버튼을 처리한다:
//   승인 → 확인 창을 거쳐 바로 approveEditRequest(Notion 반영)
//   반려 → 사유 모달을 열고, 제출되면 rejectEditRequest
// 승인 큐 API와 같은 함수·같은 권한(admin·PR 팀, 본인 요청 불가)이라 결과가 어드민 화면에 그대로 보인다.
// 누른 사람은 Slack 계정 이메일로 회원을 찾는다.
//
// Slack은 3초 안에 응답을 기대한다. 승인은 Notion을 여러 번 써서 3초를 넘길 수 있는데,
// 그래도 처리는 끝까지 하고 메시지를 chat.update로 바꾼다(Slack에 경고 아이콘만 잠깐 보인다).

type Payload = {
  type: string;
  user: { id: string };
  trigger_id?: string;
  response_url?: string;
  container?: { channel_id?: string; message_ts?: string };
  actions?: { action_id: string; value?: string }[];
  view?: {
    callback_id: string;
    private_metadata: string;
    state: { values: Record<string, Record<string, { value?: string | null }>> };
  };
};

type MessageRef = { editRequestId: string; channel?: string; ts?: string };

const ephemeral = (responseUrl: string | undefined, text: string) =>
  responseUrl
    ? fetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text }),
      }).catch((error) => console.error("[slack:ghedin] ephemeral failed", error))
    : undefined;

async function updateMessage(ref: MessageRef, message: { text: string; blocks: unknown[] }) {
  if (!ref.channel || !ref.ts) return;
  await slackApi("chat.update", { channel: ref.channel, ts: ref.ts, ...message });
}

// 어드민 화면에서 먼저 처리된 요청의 버튼을 누르면, 메시지를 지금 상태로 맞춘다.
async function syncMessage(ref: MessageRef) {
  const summary = await summarizeEditRequest(ref.editRequestId);
  const row = await prisma.editRequest.findUnique({
    where: { id: ref.editRequestId },
    include: { reviewedBy: { include: { claimedPersonEntry: true } } },
  });
  if (!summary || !row) return;
  if (row.status === "pending") return updateMessage(ref, pendingMessage(summary));
  const reviewer = row.reviewedBy?.claimedPersonEntry?.name ?? row.reviewedBy?.displayName ?? "알 수 없음";
  await updateMessage(ref, resolvedMessage(summary, { status: row.status, reviewer, reviewNote: row.reviewNote }));
}

async function reviewerOf(slackUserId: string) {
  const member = await memberOfSlackUser(slackUserId);
  if (!member) throw new ApiError("FORBIDDEN", "Slack 계정 이메일과 같은 회원을 찾지 못했습니다.");
  if (!canReviewEditRequests(member)) throw new ApiError("FORBIDDEN", "관리자와 PR 팀만 승인·반려할 수 있습니다.");
  return member;
}

async function approve(payload: Payload, ref: MessageRef) {
  try {
    const reviewer = await reviewerOf(payload.user.id);
    await approveEditRequest(reviewer, ref.editRequestId);
    const summary = await summarizeEditRequest(ref.editRequestId);
    if (summary) await updateMessage(ref, resolvedMessage(summary, { status: "approved", reviewer: `<@${payload.user.id}>` }));
  } catch (error) {
    await fail(payload, ref, error);
  }
}

async function openRejectModal(payload: Payload, ref: MessageRef) {
  try {
    const reviewer = await reviewerOf(payload.user.id);
    const row = await prisma.editRequest.findUnique({ where: { id: ref.editRequestId } });
    if (!row) throw new ApiError("NOT_FOUND", "수정 요청을 찾을 수 없습니다.");
    if (row.status !== "pending") throw new ApiError("VALIDATION_ERROR", "이미 처리된 요청입니다.");
    if (row.requesterMemberId === reviewer.id)
      throw new ApiError("FORBIDDEN", "본인이 낸 수정 요청은 다른 검토자가 처리해야 합니다.");
    const summary = await summarizeEditRequest(ref.editRequestId);
    await slackApi("views.open", {
      trigger_id: payload.trigger_id,
      view: rejectModal(JSON.stringify(ref), summary?.name ?? "요청자"),
    });
  } catch (error) {
    await fail(payload, ref, error);
  }
}

async function fail(payload: Payload, ref: MessageRef, error: unknown) {
  if (!(error instanceof ApiError)) console.error("[slack:ghedin] action failed", error);
  const message = error instanceof ApiError ? error.message : "처리하지 못했습니다. 승인 큐에서 다시 시도하세요.";
  // 이미 처리된 요청이면 메시지의 버튼을 지금 상태로 바꿔 둔다.
  if (error instanceof ApiError && error.code === "VALIDATION_ERROR") await syncMessage(ref);
  await ephemeral(payload.response_url, `:warning: ${message}`);
}

// 반려 모달 제출. 실패하면 모달에 오류를 띄워 닫히지 않게 한다.
async function submitReject(payload: Payload) {
  const ref = JSON.parse(payload.view!.private_metadata) as MessageRef;
  const reason = payload.view!.state.values.reason?.value?.value?.trim();
  if (!reason) return NextResponse.json({ response_action: "errors", errors: { reason: "반려 사유를 입력하세요." } });
  try {
    const reviewer = await reviewerOf(payload.user.id);
    const editRequest = await rejectEditRequest(reviewer, ref.editRequestId, reason);
    const summary = await summarizeEditRequest(ref.editRequestId);
    if (summary)
      await updateMessage(
        ref,
        resolvedMessage(summary, { status: "rejected", reviewer: `<@${payload.user.id}>`, reviewNote: editRequest.reviewNote }),
      );
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[slack:ghedin] reject failed", error);
    if (error instanceof ApiError && error.code === "VALIDATION_ERROR") await syncMessage(ref);
    const message = error instanceof ApiError ? error.message : "반려하지 못했습니다. 승인 큐에서 다시 시도하세요.";
    return NextResponse.json({ response_action: "errors", errors: { reason: message } });
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySlackSignature(rawBody, req.headers)) {
    console.warn("[slack:ghedin] rejected: bad signature");
    return NextResponse.json({ error: "unverified" }, { status: 401 });
  }
  const payload = JSON.parse(new URLSearchParams(rawBody).get("payload") ?? "null") as Payload | null;
  if (!payload) return new NextResponse(null, { status: 400 });

  if (payload.type === "view_submission" && payload.view?.callback_id === REJECT_VIEW) return submitReject(payload);

  const action = payload.type === "block_actions" ? payload.actions?.[0] : undefined;
  if (action?.value) {
    const ref = { editRequestId: action.value, channel: payload.container?.channel_id, ts: payload.container?.message_ts };
    if (action.action_id === APPROVE_ACTION) await approve(payload, ref);
    if (action.action_id === REJECT_ACTION) await openRejectModal(payload, ref);
  }
  return new NextResponse(null, { status: 200 });
}
