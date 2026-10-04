import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/portal/lib/errors";

// ghbot MCP 서버 전용 내부 API(app/api/v1/internal/ghbot/*)의 서버 간 인증.
// Supabase DB 접속 정보는 ghbot에 전달하지 않고, 공유 비밀값을 가진 서버만 부를 수 있다.
export function assertGhbotSharedSecret(req: Request) {
  const expected = process.env.GHBOT_AUTH_SHARED_SECRET;
  if (!expected) {
    throw new ApiError("INTERNAL_ERROR", "GH Bot 내부 인증이 설정되지 않았습니다.");
  }
  const received = req.headers.get("x-ghbot-auth-secret");
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received ?? "");
  if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
    throw new ApiError("UNAUTHENTICATED", "인증할 수 없습니다.");
  }
}
