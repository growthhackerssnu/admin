// 슬랙 백업(/slack)의 서버 쪽 도우미. 브라우저가 슬랙 API는 직접 부르지만(CORS 허용),
// files.slack.com은 CORS가 없어서 파일만 여기서 대신 받아 준다. 사용자 토큰은 저장하지 않는다.

const FILE_HOSTS = new Set(["files.slack.com", "avatars.slack-edge.com", "emoji.slack-edge.com", "secure.gravatar.com"]);

export function isAllowedFileUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && FILE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// OAuth redirect_uri는 허용된 프론트 주소(middleware.ts의 ALLOWED_ORIGINS)의 /slack/callback만.
export function isAllowedRedirect(value: string, origins: string[]) {
  return origins.some((origin) => value === `${origin}/slack/callback`);
}

// files.slack.com은 files-origin.slack.com으로 302를 돌려준다. fetch가 알아서 따라가면 다른 호스트라
// Authorization이 빠지므로 직접 따라가고, 슬랙 호스트에만 토큰을 붙인다.
export async function fetchSlackFile(value: string, token: string) {
  let url = new URL(value);
  for (let hop = 0; hop < 4; hop++) {
    const slackHost = url.hostname === "slack.com" || url.hostname.endsWith(".slack.com");
    const response = await fetch(url, {
      headers: slackHost ? { Authorization: `Bearer ${token}` } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    url = new URL(location, url);
    if (url.protocol !== "https:" || !(url.hostname.endsWith(".slack.com") || url.hostname.endsWith(".slack-edge.com"))) {
      throw new Error(`unexpected redirect to ${url.hostname}`);
    }
  }
  throw new Error("too many redirects");
}
