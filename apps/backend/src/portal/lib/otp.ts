import { createHash, randomInt } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000; // 10분
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 같은 사람에게 재발송 최소 간격

export function generateOtp(): string {
  // 000000~999999, 앞자리 0도 허용(6자리 고정 문자열).
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

// 사람이 신뢰 이메일 전체를 보지 않아도 "코드가 어디로 갔는지" 확인할 수 있게
// 일부만 보여준다. 예: cindy609@naver.com -> ci***9@naver.com
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 3) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}
