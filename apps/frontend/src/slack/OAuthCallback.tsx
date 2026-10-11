import { useEffect } from "react";
import { OAUTH_CHANNEL, type OAuthMessage } from "./oauth";

// /slack/callback — 슬랙 로그인 팝업이 돌아오는 곳. code를 /slack 창에 넘기고 닫는다.
export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message: OAuthMessage = {
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
      error: params.get("error") ?? undefined,
    };
    const channel = new BroadcastChannel(OAUTH_CHANNEL);
    channel.postMessage(message);
    channel.close();
    window.close();
  }, []);
  return (
    <p style={{ padding: 24 }}>슬랙 로그인 완료. 이 창은 닫아도 됩니다.</p>
  );
}
