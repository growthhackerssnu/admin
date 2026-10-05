import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClaim, resolvePeriodId } from "@/nut/lib/financeRepository";

// Slack 앱 "GH NUT"의 Events API 수신점. 지금은 워크플로 단계 하나만 처리한다:
//   register_nut_claim — 청구서 워크플로의 양식 답변으로 NUT 청구서를 만든다.
// 앱 설정은 src/nut/slack-app-manifest.json. 서명 비밀값은 SLACK_SIGNING_SECRET.
//
// Slack은 3초 안에 응답이 없으면 같은 이벤트를 다시 보낸다(Cloud Run 콜드 스타트 때 생길 수 있다).
// 청구서 id를 워크플로 실행 id로 만들어서 재전송이 와도 한 건만 생긴다.

function verified(body: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Inputs = {
  claimant?: string;
  date?: string;
  detail?: string;
  amount?: number | string;
  bank_account?: string;
  prepaid?: boolean | string;
  bucket?: string;
  note?: string;
};

async function slack(method: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as { ok: boolean; error?: string; user?: { real_name?: string; profile?: { email?: string; display_name?: string; real_name?: string } } };
}

// 양식 답변은 텍스트로 올 수 있어서 너그럽게 읽는다: "23,500원", "예"/"아니오" 등.
function parseAmount(value: Inputs["amount"]) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}
function parsePrepaid(value: Inputs["prepaid"]) {
  if (typeof value === "boolean") return value;
  return !/^(아니|no|false|x)/i.test(String(value ?? "예").trim());
}

async function registerClaim(executionId: string, inputs: Inputs, token: string) {
  const amount = parseAmount(inputs.amount);
  const detail = inputs.detail?.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(inputs.date ?? "") ? inputs.date! : new Date().toISOString().slice(0, 10);
  if (!amount || !detail) throw new Error("금액과 상세 내역이 필요합니다.");

  // 청구인 Slack 계정의 이메일이 회원 명단에 있으면 그 회원의 청구서로 잇는다(본인에게 계좌가 보인다).
  const info = inputs.claimant ? await slack("users.info", token, { user: inputs.claimant }) : null;
  const email = info?.user?.profile?.email;
  const member = email ? await prisma.member.findUnique({ where: { email } }) : null;
  const name =
    member?.displayName ?? info?.user?.profile?.real_name ?? info?.user?.real_name ?? info?.user?.profile?.display_name ?? "이름 미상";

  return createClaim(await resolvePeriodId(null), {
    id: `claim-slack-${executionId}`,
    memberId: member?.id ?? null,
    claimant: name,
    date,
    detail,
    amount,
    bucket: inputs.bucket?.trim() || "미분류",
    bankAccount: inputs.bank_account?.trim() || null,
    prepaid: parsePrepaid(inputs.prepaid),
    note: inputs.note?.trim() || null,
    source: "Slack",
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  if (!verified(body, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature")))
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const payload = JSON.parse(body) as {
    type: string;
    challenge?: string;
    event?: {
      type: string;
      function?: { callback_id?: string };
      function_execution_id?: string;
      inputs?: Inputs;
      bot_access_token?: string;
    };
  };
  if (payload.type === "url_verification") return NextResponse.json({ challenge: payload.challenge });

  const event = payload.event;
  if (event?.type === "function_executed" && event.function?.callback_id === "register_nut_claim") {
    const token = event.bot_access_token!;
    const executionId = event.function_execution_id!;
    try {
      const claimId = await registerClaim(executionId, event.inputs ?? {}, token);
      await slack("functions.completeSuccess", token, { function_execution_id: executionId, outputs: { claim_id: claimId } });
    } catch (error) {
      console.error("[slack] register_nut_claim failed", error);
      await slack("functions.completeError", token, {
        function_execution_id: executionId,
        error: error instanceof Error ? error.message : "NUT에 청구서를 등록하지 못했습니다.",
      });
    }
  }
  return new NextResponse(null, { status: 200 });
}
