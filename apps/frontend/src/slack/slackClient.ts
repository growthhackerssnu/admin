// 브라우저에서 slack.com/api를 직접 부른다. slack.com은 CORS를 허용하지만 Authorization 헤더는
// 허용 목록에 없어서 토큰을 폼 필드로 보낸다. 요청은 한 번에 하나씩, 429면 Retry-After만큼 기다린다.

export class SlackError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SlackError";
  }
}

/** 토큰이 더는 안 통하는 오류 — 백업을 멈추고 다시 로그인하게 한다. */
export const AUTH_ERRORS = new Set([
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
  "account_inactive",
]);

type Params = Record<string, string | number | boolean | undefined>;
export type SlackClient = {
  call(method: string, params?: Params): Promise<any>;
};

export function createSlackClient(
  token: string,
  {
    fetch = globalThis.fetch.bind(globalThis),
    sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    onWait,
  }: {
    fetch?: typeof globalThis.fetch;
    sleep?: (ms: number) => Promise<void>;
    onWait?: (seconds: number) => void;
  } = {},
): SlackClient {
  async function call(method: string, params: Params = {}) {
    const body = new URLSearchParams({ token });
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) body.set(key, String(value));
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(`https://slack.com/api/${method}`, {
          method: "POST",
          body,
        });
      } catch (error) {
        // 네트워크가 잠깐 끊긴 경우. 몇 번만 다시 해 본다.
        if (attempt >= 3) throw error;
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after")) || 30;
        onWait?.(seconds);
        await sleep(seconds * 1000);
        onWait?.(0);
        continue;
      }
      const json = await response.json();
      if (!json.ok)
        throw new SlackError(json.error ?? `http_${response.status}`);
      return json;
    }
  }
  return { call };
}

/** cursor 페이지를 끝까지 넘기며 key 배열을 모은다. */
export async function paginate<T>(
  client: SlackClient,
  method: string,
  params: Params,
  key: string,
  signal?: AbortSignal,
) {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    signal?.throwIfAborted();
    const page = await client.call(method, { ...params, cursor, limit: 200 });
    items.push(...((page[key] ?? []) as T[]));
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return items;
}
