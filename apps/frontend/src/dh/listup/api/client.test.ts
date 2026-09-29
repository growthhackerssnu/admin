import { describe, expect, it, vi } from "vitest";
import { createListupApi, ListupApiError } from "./client";
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const outreach = {
  id: "outreach-1",
  companyId: "company-1",
  version: 4,
  workStage: "draft_review",
};
function setup() {
  const fetcher = vi.fn<typeof fetch>();
  const token = vi.fn(async () => "session-token" as string | null);
  return {
    fetcher,
    token,
    api: createListupApi({
      baseUrl: "https://backend.example/api/v1/",
      getAccessToken: token,
      fetch: fetcher,
    }),
  };
}
describe("listup real API adapter", () => {
  it("creates only a target quarter and preserves duplicate errors", async () => {
    const { api, fetcher } = setup();
    fetcher.mockResolvedValue(response({ data: { id: "q-2027-1", year: 2027, quarter: 1 } }, 201));
    expect(await api.createTargetQuarter({ year: 2027, quarter: 1 }, { idempotencyKey: "quarter-1" })).toEqual({ id: "q-2027-1", year: 2027, quarter: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://backend.example/api/v1/target-quarters");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ year: 2027, quarter: 1 });
    fetcher.mockResolvedValue(response({ error: { code: "ALREADY_EXISTS", message: "이미 있는 목표 분기입니다." } }, 409));
    await expect(api.createTargetQuarter({ year: 2027, quarter: 1 }, { idempotencyKey: "quarter-2" })).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
  });
  it("keeps search acceptance separate from completion and preserves its idempotency key", async () => {
    const { api, fetcher } = setup();
    const input = {
      targetQuarterId: "quarter-27q1",
      sources: [{ key: "Google", name: "Google", entryUrls: [], query: null }],
      filters: { industries: [], keywords: [], regions: [], companyStages: [], excludedCompanyIds: [], additionalConditions: null },
      maxCompanies: 10,
    };
    fetcher.mockResolvedValue(response({ data: { searchRun: { id: "run-1", status: "queued" }, initialTask: { id: "task-1", status: "queued" } } }, 202));
    const accepted = await api.createSearchRun(input, { idempotencyKey: "search-operation-1" });
    expect(accepted.searchRun.status).toBe("queued");
    expect(fetcher.mock.calls[0][0]).toBe("https://backend.example/api/v1/search-runs");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual(input);
    expect(fetcher.mock.calls[0][1]!.headers).toMatchObject({ "Idempotency-Key": "search-operation-1" });
    fetcher.mockResolvedValue(response({ data: {}, }, 202));
    await expect(api.createSearchRun(input, { idempotencyKey: "search-operation-1" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("preserves pagination and encodes filters; gets a fresh token for every request", async () => {
    const { api, fetcher, token } = setup();
    fetcher.mockResolvedValue(
      response({
        data: [{ id: "candidate-1", company: { id: "company-1" } }],
        page: { nextCursor: "next", hasMore: true },
      }),
    );
    const result = await api.listCandidates({
      q: "AI & 데이터",
      cursor: "a/b",
    });
    expect(result.items[0].id).toBe("candidate-1");
    expect(result.items[0].company.id).toBe("company-1");
    expect(result.nextCursor).toBe("next");
    expect(result.hasMore).toBe(true);
    expect(String(fetcher.mock.calls[0][0])).toContain("cursor=a%2Fb");
    token.mockResolvedValue("refreshed");
    fetcher.mockResolvedValue(
      response({ data: [], page: { nextCursor: null, hasMore: false } }),
    );
    await api.listCandidates();
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({
      Authorization: "Bearer refreshed",
    });
  });
  it("accepts the separate outreach contacts envelope and retains endpoint IDs/exclusions", async () => {
    const { api, fetcher } = setup();
    const contact = {
      contactId: "contact-1",
      selectable: false,
      excludedReason: "이미 연락",
      endpoints: [{ endpointId: "endpoint-1" }, { endpointId: "endpoint-2" }],
    };
    fetcher.mockResolvedValue(
      response({ data: { items: [contact], nextCursor: null } }),
    );
    expect(await api.listOutreachContacts("outreach-1")).toEqual({
      items: [contact],
      nextCursor: null,
      hasMore: false,
    });
  });
  it("does not make anonymous requests or fall back to mock results", async () => {
    const { api, token, fetcher } = setup();
    token.mockResolvedValue(null);
    await expect(api.listCandidates()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("posts candidate revision and preserves the operation key on an explicit retry", async () => {
    const { api, fetcher } = setup();
    fetcher
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(response({ data: outreach }));
    const options = { idempotencyKey: "same-operation" };
    await expect(
      api.startOutreach("candidate-1", 3, options),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await api.startOutreach("candidate-1", 3, options)).toEqual(
      outreach,
    );
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toBe(
        "https://backend.example/api/v1/candidates/candidate-1/outreaches",
      );
      expect(init?.body).toBe(JSON.stringify({ expectedRevision: 3 }));
      expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe(
        "same-operation",
      );
    }
  });
  it("sends actual contact and endpoint IDs; approves the current draft revision", async () => {
    const { api, fetcher } = setup();
    fetcher.mockResolvedValue(response({ data: outreach }));
    const opts = { idempotencyKey: "operation" };
    await api.selectRecipient(
      "outreach-1",
      { expectedVersion: 2, contactId: "contact-1", endpointId: "endpoint-2" },
      opts,
    );
    expect(fetcher.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      expectedVersion: 2,
      contactId: "contact-1",
      endpointId: "endpoint-2",
    });
    fetcher.mockResolvedValue(response({ data: outreach }));
    await api.approveDraft("outreach-1", 4, 2, opts);
    expect(fetcher.mock.calls[1][0]).toContain("/drafts/outreach-1/approval");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      expectedVersion: 4,
      expectedRevision: 2,
    });
  });
  it("surfaces version conflicts for reload without retrying or claiming success", async () => {
    const { api, fetcher } = setup();
    fetcher.mockResolvedValue(
      response(
        {
          error: {
            code: "VERSION_CONFLICT",
            message: "최신 내용을 확인",
            fieldErrors: { version: "stale" },
          },
          requestId: "trace-1",
        },
        409,
      ),
    );
    const error = await api
      .generateDraft("outreach-1", 1, { idempotencyKey: "generation" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ListupApiError);
    expect(error.requiresReload).toBe(true);
    expect(error.requestId).toBe("trace-1");
    expect(error.details).toEqual({ version: "stale" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not treat an HTML page or wrong envelope as an empty successful result", async () => {
    const { api, fetcher } = setup();
    fetcher.mockResolvedValue(new Response("<html>login</html>"));
    await expect(api.listCandidates()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("propagates cancellation rather than displaying a connection failure", async () => {
    const { api, fetcher } = setup();
    const controller = new AbortController();
    controller.abort();
    const error = new DOMException("aborted", "AbortError");
    fetcher.mockRejectedValue(error);
    await expect(
      api.listCandidates({}, { signal: controller.signal }),
    ).rejects.toBe(error);
  });
});
