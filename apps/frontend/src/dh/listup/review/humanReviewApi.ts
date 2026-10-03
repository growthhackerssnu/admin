import { supabase } from "../../../lib/supabase";

export type ApiEnvelope<T> = {
  data: T;
  page?: { hasMore: boolean; nextCursor: string | null };
};
export interface HumanReviewTransport {
  request<T, Metadata extends object = Record<never, never>>(
    path: string,
    method?: string,
    body?: unknown,
    key?: string,
  ): Promise<ApiEnvelope<T> & Metadata>;
}
export class HumanReviewApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Shared authenticated transport for discovery and history, with no browser-stored history data. */
export class HumanReviewApi implements HumanReviewTransport {
  private readonly base: string;
  constructor() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    if (!configured)
      throw new Error("프론트엔드의 VITE_API_BASE_URL을 설정해주세요.");
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("백엔드 주소가 올바르지 않습니다.");
    this.base =
      configured.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
  }
  async request<T, Metadata extends object = Record<never, never>>(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
  ): Promise<ApiEnvelope<T> & Metadata> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token)
      throw new Error("로그인 후 다시 시도해주세요.");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${data.session.access_token}`,
    };
    if (method !== "GET") {
      if (!key) throw new Error("요청 식별자가 필요합니다.");
      headers["Content-Type"] = "application/json";
      headers["Idempotency-Key"] = key;
    }
    let response: Response;
    try {
      response = await fetch(this.base + path, {
        method,
        headers,
        credentials: "omit",
        redirect: "error",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new HumanReviewApiError(
        "서버에 연결하지 못했습니다. 처리 여부를 확인한 뒤 다시 시도해주세요.",
        0,
      );
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new HumanReviewApiError(
        payload?.error?.message ?? `요청에 실패했습니다. (${response.status})`,
        response.status,
        payload?.error?.code,
      );
    if (!payload || !("data" in payload))
      throw new Error("서버 응답 형식이 올바르지 않습니다.");
    return payload as ApiEnvelope<T> & Metadata;
  }
}
