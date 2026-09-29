import type {
  Assessment,
  CandidateContact,
  CandidateDetail,
  CandidateQuery,
  CandidateRow,
  OutreachContact,
  OutreachRow,
  OutreachDetail,
  Page,
  SearchInput,
  SearchRun,
  SearchOptions,
} from "./contracts";

export class ListupApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public requestId?: string,
    public details?: unknown,
    public retryable = false,
  ) {
    super(message);
    this.name = "ListupApiError";
  }
  get requiresReload() {
    return (
      this.code === "VERSION_CONFLICT" || this.code === "REVISION_CONFLICT"
    );
  }
}
export interface ClientOptions {
  // Backend origin, optionally including /api/v1. Never pass a frontend URL.
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}
export interface ReadOptions {
  signal?: AbortSignal;
}
export interface WriteOptions extends ReadOptions {
  idempotencyKey: string;
}
export const newOperationKey = () => crypto.randomUUID();
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const invalid = () =>
  new ListupApiError(
    "INVALID_RESPONSE",
    "서버 응답 형식을 확인할 수 없습니다.",
  );
const segment = (id: string) => {
  if (!id.trim())
    throw new ListupApiError("INVALID_ID", "서버 ID가 필요합니다.");
  return encodeURIComponent(id);
};

export function createListupApi(options: ClientOptions) {
  if (!options.baseUrl.trim())
    throw new ListupApiError("NOT_CONFIGURED", "백엔드 주소를 설정해주세요.");
  const url = new URL(options.baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ListupApiError(
      "NOT_CONFIGURED",
      "백엔드 주소가 올바르지 않습니다.",
    );
  const base =
    options.baseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
  const fetcher = options.fetch ?? fetch;
  async function request(
    path: string,
    method: string,
    body: unknown,
    opts: ReadOptions & Partial<WriteOptions> = {},
  ) {
    const token = await options.getAccessToken(); // Read afresh: never retain/log tokens.
    if (!token)
      throw new ListupApiError("UNAUTHENTICATED", "로그인이 필요합니다.", 401);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (method !== "GET") {
      if (!opts.idempotencyKey?.trim())
        throw new ListupApiError(
          "MISSING_OPERATION_KEY",
          "요청 식별자가 필요합니다.",
        );
      headers["Content-Type"] = "application/json";
      headers["Idempotency-Key"] = opts.idempotencyKey;
    }
    let response: Response;
    try {
      response = await fetcher(base + path, {
        method,
        headers,
        signal: opts.signal,
        credentials: "omit",
        redirect: "error",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (
        opts.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      throw new ListupApiError(
        "NETWORK_ERROR",
        "서버에 연결하지 못했습니다. 처리 여부 확인 후 같은 요청 키로 재시도하세요.",
        0,
        undefined,
        undefined,
        true,
      );
    }
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const err = object(json) && object(json.error) ? json.error : {};
      throw new ListupApiError(
        typeof err.code === "string" ? err.code : `HTTP_${response.status}`,
        typeof err.message === "string" ? err.message : "요청에 실패했습니다.",
        response.status,
        object(json) && typeof json.requestId === "string"
          ? json.requestId
          : typeof err.requestId === "string"
            ? err.requestId
            : undefined,
        err.details ?? err.fieldErrors,
        err.retryable === true,
      );
    }
    if (!object(json) || !("data" in json)) throw invalid();
    return json;
  }
  async function one<T>(path: string, opts?: ReadOptions): Promise<T> {
    const result = await request(path, "GET", undefined, opts);
    if (!object(result.data)) throw invalid();
    return result.data as T;
  }
  async function page<T>(path: string, opts?: ReadOptions): Promise<Page<T>> {
    const result = await request(path, "GET", undefined, opts);
    if (
      Array.isArray(result.data) &&
      object(result.page) &&
      typeof result.page.hasMore === "boolean" &&
      (result.page.nextCursor === null ||
        typeof result.page.nextCursor === "string")
    ) {
      return {
        items: result.data,
        nextCursor: result.page.nextCursor,
        hasMore: result.page.hasMore,
      };
    }
    if (
      object(result.data) &&
      Array.isArray(result.data.items) &&
      (result.data.nextCursor === null ||
        typeof result.data.nextCursor === "string")
    ) {
      return {
        items: result.data.items,
        nextCursor: result.data.nextCursor,
        hasMore: result.data.nextCursor !== null,
      };
    }
    throw invalid();
  }
  async function write(
    path: string,
    method: string,
    body: unknown,
    opts: WriteOptions,
  ): Promise<OutreachDetail> {
    const result = await request(path, method, body, opts);
    if (
      !object(result.data) ||
      typeof result.data.id !== "string" ||
      typeof result.data.version !== "number" ||
      typeof result.data.workStage !== "string"
    )
      throw invalid();
    return result.data as unknown as OutreachDetail;
  }
  function query(input: object) {
    const params = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "")
        params.set(key, String(value));
    });
    return params.size ? `?${params}` : "";
  }
  const outreachPath = (id: string) => `/outreaches/${segment(id)}`;
  return {
    createTargetQuarter: async (
      input: { year: number; quarter: number },
      opts: WriteOptions,
    ) => {
      const result = await request("/target-quarters", "POST", input, opts);
      if (
        !object(result.data) ||
        typeof result.data.id !== "string" ||
        typeof result.data.year !== "number" ||
        typeof result.data.quarter !== "number"
      )
        throw invalid();
      return result.data as { id: string; year: number; quarter: number };
    },
    getSearchOptions: (opts?: ReadOptions) =>
      one<SearchOptions>("/search-options", opts),
    listSearchRuns: (
      input: { cursor?: string; limit?: number } = {},
      opts?: ReadOptions,
    ) => page<SearchRun>("/search-runs" + query(input), opts),
    createSearchRun: async (input: SearchInput, opts: WriteOptions) => {
      const result = await request("/search-runs", "POST", input, opts);
      if (
        !object(result.data) ||
        !object(result.data.searchRun) ||
        typeof result.data.searchRun.id !== "string" ||
        typeof result.data.searchRun.status !== "string"
      )
        throw invalid();
      return result.data as unknown as {
        searchRun: SearchRun;
        initialTask: { id: string; status: string };
      };
    },
    listOutreaches: (
      input: { cursor?: string; limit?: number; query?: string } = {},
      opts?: ReadOptions,
    ) => page<OutreachRow>("/companies" + query(input), opts),
    listCandidates: (input: CandidateQuery = {}, opts?: ReadOptions) =>
      page<CandidateRow>("/candidates" + query(input), opts),
    getCandidate: (id: string, opts?: ReadOptions) =>
      one<CandidateDetail>(`/candidates/${segment(id)}`, opts),
    listCandidateContacts: (
      id: string,
      input: {
        cursor?: string;
        limit?: number;
        status?: string;
        type?: "email" | "linkedin";
      } = {},
      opts?: ReadOptions,
    ) =>
      page<CandidateContact>(
        `/candidates/${segment(id)}/contacts` + query(input),
        opts,
      ),
    listFitAssessments: (
      id: string,
      input: { cursor?: string; limit?: number } = {},
      opts?: ReadOptions,
    ) =>
      page<Assessment>(
        `/candidates/${segment(id)}/fit-assessments` + query(input),
        opts,
      ),
    listTargetQuarters: (
      input: { cursor?: string; limit?: number } = {},
      opts?: ReadOptions,
    ) =>
      page<{ id: string; year: number; quarter: number }>(
        "/target-quarters" + query(input),
        opts,
      ),
    getOutreach: (id: string, opts?: ReadOptions) =>
      one<OutreachDetail>(outreachPath(id), opts),
    listOutreachContacts: (id: string, opts?: ReadOptions) =>
      page<OutreachContact>(outreachPath(id) + "/contacts", opts),
    startOutreach: (
      candidateId: string,
      expectedRevision: number,
      opts: WriteOptions,
    ) =>
      write(
        `/candidates/${segment(candidateId)}/outreaches`,
        "POST",
        { expectedRevision },
        opts,
      ),
    selectRecipient: (
      id: string,
      input: { expectedVersion: number; contactId: string; endpointId: string },
      opts: WriteOptions,
    ) => write(outreachPath(id) + "/recipient", "PUT", input, opts),
    generateDraft: (id: string, expectedVersion: number, opts: WriteOptions) =>
      write(
        outreachPath(id) + "/draft-generation",
        "POST",
        { expectedVersion },
        opts,
      ),
    saveDraft: (
      id: string,
      input: {
        expectedVersion: number;
        expectedRevision: number;
        topic: string;
        subject: string;
        body: string;
      },
      opts: WriteOptions,
    ) => write(`/drafts/${segment(id)}`, "PATCH", input, opts),
    approveDraft: (
      id: string,
      expectedVersion: number,
      expectedRevision: number,
      opts: WriteOptions,
    ) =>
      write(
        `/drafts/${segment(id)}/approval`,
        "POST",
        { expectedVersion, expectedRevision },
        opts,
      ),
    reviewRecipient: (
      id: string,
      expectedVersion: number,
      opts: WriteOptions,
    ) =>
      write(
        outreachPath(id) + "/recipient-review",
        "POST",
        { expectedVersion },
        opts,
      ),
    reviewDraft: (id: string, expectedVersion: number, opts: WriteOptions) =>
      write(
        outreachPath(id) + "/draft-review",
        "POST",
        { expectedVersion, draftId: id },
        opts,
      ),
  };
}
export type ListupApi = ReturnType<typeof createListupApi>;
