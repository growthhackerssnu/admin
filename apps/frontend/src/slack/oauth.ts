// "슬랙으로 로그인" 팝업. 팝업이 /slack/callback으로 돌아오면 BroadcastChannel로 code를 넘긴다.
// (slack.com이 COOP를 걸면 window.opener가 끊기므로 postMessage 대신 BroadcastChannel을 쓴다.)
import { exchangeCode, type SlackSession } from "./api";

export const OAUTH_CHANNEL = "gh-slack-oauth";
const USER_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "users:read",
  "files:read",
  "emoji:read",
  "usergroups:read",
].join(",");

export type OAuthMessage = { code?: string; state?: string; error?: string };

/** 버튼 클릭 안에서 바로 불러야 팝업이 막히지 않는다. */
export function signInWithSlack(): Promise<SlackSession> {
  const clientId = import.meta.env.VITE_SLACK_EXPORT_CLIENT_ID;
  if (!clientId)
    return Promise.reject(
      new Error(
        "슬랙 백업 앱이 설정되지 않았습니다(VITE_SLACK_EXPORT_CLIENT_ID).",
      ),
    );
  const state = crypto.randomUUID();
  const redirectUri = `${window.location.origin}/slack/callback`;
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    user_scope: USER_SCOPES,
    redirect_uri: redirectUri,
    state,
  }).toString();
  const popup = window.open(url, "gh-slack-login", "width=600,height=780");
  if (!popup)
    return Promise.reject(
      new Error("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요."),
    );

  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(OAUTH_CHANNEL);
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new Error("슬랙 로그인 시간이 지났습니다. 다시 시도하세요.")),
        ),
      5 * 60_000,
    );
    function finish(next: () => void) {
      clearTimeout(timer);
      channel.close();
      next();
    }
    channel.onmessage = ({ data }: MessageEvent<OAuthMessage>) => {
      if (data.state !== state) return;
      if (data.error || !data.code)
        return finish(() =>
          reject(
            new Error(
              data.error === "access_denied"
                ? "슬랙 로그인을 취소했습니다."
                : `슬랙 로그인 실패: ${data.error}`,
            ),
          ),
        );
      finish(() => exchangeCode(data.code!, redirectUri).then(resolve, reject));
    };
  });
}
