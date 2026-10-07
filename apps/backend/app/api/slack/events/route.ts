import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordArrival, recordRollCall, type Person } from "@/nut/lib/attendance";
import { createClaim, findRefundAccount, resolvePeriodId } from "@/nut/lib/financeRepository";
import { normalizeName } from "@/portal/lib/normalize";

// Slack 앱 "GH NUT"(A0C802VMHK2)의 Events API 수신점. 워크플로 단계 세 개를 처리한다:
//   register_nut_claim      — 청구서 워크플로의 양식 답변으로 NUT 청구서를 만든다.
//   record_roll_call        — '출석핑' 워크플로의 출석체크 양식(네 명단)을 출석 기록으로 만든다.
//   record_late_arrival     — '출석핑'의 '지각했어용' 버튼 양식(몇 분 늦었는지)을 그 사람의 기록에 채운다.
// 앱 설정은 slack-app/manifest.json(Slack CLI 프로젝트: cd slack-app && slack install --app A0C802VMHK2).
//
// 요청 검증: 서명 비밀값 대신 이벤트에 딸려오는 단기 봇 토큰을 Slack에 확인한다
// (auth.test → bots.info로 이 앱이 발급받은 토큰인지). 위조 요청은 유효한 토큰을 가질 수 없다.
// Slack은 3초 안에 응답이 없으면 같은 이벤트를 다시 보내거나 단계를 실패 처리한다(Cloud Run 콜드 스타트 때 생긴다).
// 그래서 Cloud Scheduler 작업 admin-backend-keep-warm(asia-northeast3)이 5분마다 /api/health를 두드려 인스턴스를 데워 둔다.
// 청구서·출석 기록 id를 워크플로 실행 id로 만들어서 재전송이 와도 한 건만 생긴다.
const APP_ID = "A0C802VMHK2";

// 거절 이유를 로그에 남긴다(Slack 쪽엔 event_dispatch_failed만 보인다).
// 워크플로 토큰(xwfp-)은 auth.test에 bot_id가 없을 수 있어서, 토큰의 사용자(= 앱의 봇 사용자)를
// users.info로 열어 profile.api_app_id를 확인한다. bot_id가 있으면 bots.info로도 확인한다.
async function issuedToOurApp(token: string | undefined) {
  if (!token) return "no token";
  const auth = (await slack("auth.test", token, {})) as {
    ok: boolean;
    error?: string;
    bot_id?: string;
    user_id?: string;
    team_id?: string;
  };
  if (!auth.ok) return `auth.test: ${auth.error}`;
  const team = auth.team_id ? { team_id: auth.team_id } : {};
  if (auth.bot_id) {
    const bot = (await slack("bots.info", token, { bot: auth.bot_id, ...team })) as {
      ok: boolean;
      bot?: { app_id?: string };
    };
    if (bot.ok && bot.bot?.app_id === APP_ID) return null;
  }
  if (auth.user_id) {
    const user = (await slack("users.info", token, { user: auth.user_id })) as {
      ok: boolean;
      error?: string;
      user?: { is_bot?: boolean; profile?: { api_app_id?: string } };
    };
    if (user.ok && user.user?.is_bot && user.user.profile?.api_app_id === APP_ID) return null;
    if (!user.ok) return `users.info: ${user.error}`;
    return `bot user app ${user.user?.profile?.api_app_id ?? "?"}`;
  }
  return `auth.test fields: ${Object.keys(auth).join(",")}`;
}

type Inputs = {
  claimant?: string;
  date?: string;
  detail?: string;
  amount?: number | string;
  bank_account?: string;
  bucket?: string;
  note?: string;
};

async function slack(method: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    // 조회 메서드(auth.test·bots.info·users.info)는 JSON 본문의 인자를 무시하므로 폼으로 보낸다.
    // functions.complete*는 outputs가 객체라 JSON으로 보낸다.
    ...(method.startsWith("functions.")
      ? {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(body),
        }
      : {
          headers: { Authorization: `Bearer ${token}` },
          body: new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])),
        }),
  });
  return (await response.json()) as {
    ok: boolean;
    error?: string;
    user?: { real_name?: string; profile?: { email?: string; display_name?: string; real_name?: string } };
  };
}

// 양식 답변은 텍스트로 올 수 있어서 너그럽게 읽는다: "23,500원" 등.
function parseAmount(value: Inputs["amount"]) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

type RollCallInputs = {
  project?: string;
  excused_absent?: string[];
  excused_late?: string[];
  unexcused_absent?: string[];
  unexcused_late?: string[];
};
type ArrivalInputs = { user?: string; minutes?: number | string };

// 출석 기록의 이름은 환급 계좌 명단(= 학회원 명단)의 이름, 없으면 Slack 이름에서 공백을 뺀 것.
async function personOf(userId: string, token: string): Promise<Person> {
  const info = await slack("users.info", token, { user: userId });
  const email = info.user?.profile?.email?.toLowerCase() ?? null;
  const slackName = info.user?.profile?.real_name ?? info.user?.real_name ?? info.user?.profile?.display_name;
  const account = await findRefundAccount(email, slackName);
  return { name: account?.name ?? (slackName ? normalizeName(slackName) : userId), email };
}

// 워크플로가 도는 날(한국 시간)이 출석 날짜다.
const todayInSeoul = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

async function registerRollCall(executionId: string, inputs: RollCallInputs, token: string) {
  const people = (ids?: string[]) => Promise.all((ids ?? []).map((id) => personOf(id, token)));
  const count = await recordRollCall(executionId, todayInSeoul(), inputs.project?.trim() || null, [
    { people: await people(inputs.excused_absent), type: "absent", excuse: "excused" },
    { people: await people(inputs.excused_late), type: "late", excuse: "excused" },
    { people: await people(inputs.unexcused_absent), type: "absent", excuse: "unexcused" },
    { people: await people(inputs.unexcused_late), type: "late", excuse: "unexcused" },
  ]);
  return { recorded: count };
}

async function registerArrival(executionId: string, inputs: ArrivalInputs, token: string) {
  const minutes = parseAmount(inputs.minutes);
  if (!inputs.user || minutes == null) throw new Error("몇 분 늦었는지 숫자로 입력하세요.");
  return { record_id: await recordArrival(executionId, todayInSeoul(), await personOf(inputs.user, token), minutes) };
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
  // 청구인 이름은 환급 계좌 명단의 이름을 쓴다(시트의 '선결제 후지급' 칸처럼 정규화된 이름).
  // 명단에 없으면 회원·Slack 이름에서 공백을 뺀다.
  const slackName = member?.displayName ?? info?.user?.profile?.real_name ?? info?.user?.real_name ?? info?.user?.profile?.display_name;
  const account = await findRefundAccount(email, slackName);
  const name = account?.name ?? (slackName ? normalizeName(slackName) : "이름 미상");

  return createClaim(await resolvePeriodId(null), {
    id: `claim-slack-${executionId}`,
    memberId: member?.id ?? null,
    claimant: name,
    date,
    detail,
    amount,
    bucket: inputs.bucket?.trim() || "미분류",
    // 양식에 계좌가 없으면 환급 계좌 명단(NUT '환급 계좌' 탭)에서 채운다.
    bankAccount: inputs.bank_account?.trim() || account?.bankAccount || null,
    // 청구서는 모두 선결제 후지급이다(회원이 먼저 내고 학회가 돌려준다).
    prepaid: true,
    note: inputs.note?.trim() || null,
    source: "Slack",
  });
}

const steps = {
  register_nut_claim: async (id: string, inputs: Inputs, token: string) => ({ claim_id: await registerClaim(id, inputs, token) }),
  record_roll_call: registerRollCall,
  record_late_arrival: registerArrival,
} as Record<string, (id: string, inputs: Record<string, unknown>, token: string) => Promise<Record<string, unknown>>>;

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as {
    type?: string;
    challenge?: string;
    event?: {
      type: string;
      function?: { callback_id?: string };
      function_execution_id?: string;
      inputs?: Record<string, unknown>;
      bot_access_token?: string;
    };
  } | null;
  // 요청 URL 확인: 받은 값을 그대로 돌려줄 뿐이라 검증할 것이 없다.
  if (payload?.type === "url_verification") return NextResponse.json({ challenge: payload.challenge });

  const event = payload?.event;
  const callbackId = event?.function?.callback_id;
  if (event?.type !== "function_executed" || !callbackId || !(callbackId in steps))
    return new NextResponse(null, { status: 200 });
  const token = event.bot_access_token;
  const rejected = event.function_execution_id ? await issuedToOurApp(token) : "no function_execution_id";
  if (rejected) {
    console.warn(`[slack] ${callbackId} rejected: ${rejected}`);
    return NextResponse.json({ error: "unverified" }, { status: 401 });
  }

  const executionId = event.function_execution_id!;
  // 완료 보고가 거절되면(예: 3초를 넘겨 Slack이 이미 단계를 실패 처리함) 기록은 됐는데 워크플로는 실패로 보인다.
  // 그 흔적이 남도록 로그에 적는다.
  const report = async (method: string, body: Record<string, unknown>) => {
    const result = await slack(method, token!, { function_execution_id: executionId, ...body });
    if (!result.ok) console.warn(`[slack] ${callbackId} ${executionId} ${method}: ${result.error}`);
  };
  try {
    const outputs = await steps[callbackId]!(executionId, event.inputs ?? {}, token!);
    await report("functions.completeSuccess", { outputs });
  } catch (error) {
    console.error(`[slack] ${callbackId} failed`, error);
    await report("functions.completeError", {
      error: error instanceof Error ? error.message : "NUT에 기록하지 못했습니다.",
    });
  }
  return new NextResponse(null, { status: 200 });
}
