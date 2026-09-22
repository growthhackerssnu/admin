import { Resend } from "resend";

// 지연 생성 — supabase.ts/notion.ts와 같은 이유.
let cached: Resend | null = null;

function getResendClient(): Resend {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY가 설정되지 않았습니다.");
  }
  cached = new Resend(apiKey);
  return cached;
}

// 도메인 인증 전(Resend Domains에 ghsnu.com 등록 전)에는 이 주소로만 발신 가능.
// 등록 후에는 RESEND_FROM_ADDRESS로 실제 학회 도메인 주소를 지정한다.
const DEFAULT_FROM = "onboarding@resend.dev";

export async function sendOtpEmail(opts: { to: string; name: string; otp: string; desiredEmail: string }) {
  const from = process.env.RESEND_FROM_ADDRESS || DEFAULT_FROM;
  const { error } = await getResendClient().emails.send({
    from: `대협봇 <${from}>`,
    to: opts.to,
    subject: "[대협봇] 가입 인증 코드",
    text: [
      `${opts.name}님, 안녕하세요.`,
      "",
      `${opts.desiredEmail} 계정으로 대협봇 가입을 신청하셨습니다.`,
      "",
      `인증 코드: ${opts.otp}`,
      "",
      "이 코드는 10분간 유효합니다. 본인이 신청하지 않았다면 이 메일을 무시하세요.",
    ].join("\n"),
  });

  if (error) {
    throw new Error(`OTP 메일 발송 실패: ${error.message}`);
  }
}
