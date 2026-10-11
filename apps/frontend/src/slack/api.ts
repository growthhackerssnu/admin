// 슬랙 백업이 부르는 우리 백엔드 API 두 개: OAuth code 교환, 파일 프록시.
import { supabase } from "../lib/supabase";

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

async function post(path: string, body: unknown) {
  const session = (await supabase.auth.getSession()).data.session;
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

export type SlackSession = {
  token: string;
  userId: string;
  teamId: string;
  teamName: string;
};

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<SlackSession> {
  const response = await post("/api/v1/slack-export/oauth", {
    code,
    redirectUri,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error?.message ?? "슬랙 로그인에 실패했습니다.");
  return payload.data;
}

export async function downloadSlackFile(url: string, token: string) {
  const response = await post("/api/v1/slack-export/file", { url, token });
  if (!response.ok) throw new Error(`file ${response.status}`);
  return response.blob();
}
