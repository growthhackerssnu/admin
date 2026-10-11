import { describe, expect, it } from "vitest";
import { runExport, monthKey, mergeWindow, OVERLAP_SECONDS } from "./exporter";
import { createSlackClient, SlackError, type SlackClient } from "./slackClient";
import { memoryFolder } from "./folder";
import type { Manifest, SlackMessage } from "./types";

const ts = (iso: string) => `${Date.parse(iso) / 1000}.000100`;

// 가짜 워크스페이스: 대화별 메시지(부모)와 스레드 답글. history는 oldest 이후만, 최신순으로 준다.
function fakeSlack(data: {
  history: Record<string, SlackMessage[]>;
  replies?: Record<string, SlackMessage[]>;
  failing?: Record<string, string>;
  usergroupsError?: string;
}) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const client: SlackClient = {
    async call(method, params = {}) {
      calls.push({ method, params });
      switch (method) {
        case "auth.test":
          return { ok: true, team_id: "T1", team: "GH", user_id: "U1" };
        case "users.list":
          return {
            ok: true,
            members: [{ id: "U1", name: "jay", profile: {} }],
          };
        case "usergroups.list":
          if (data.usergroupsError) throw new SlackError(data.usergroupsError);
          return {
            ok: true,
            usergroups: [{ id: "S1", handle: "cm", name: "CM팀" }],
          };
        case "emoji.list":
          return {
            ok: true,
            emoji: {
              party: "https://emoji.slack-edge.com/T1/party/a.gif",
              yay: "alias:party",
            },
          };
        case "conversations.list":
          return {
            ok: true,
            channels: Object.keys(data.history).map((id) => ({
              id,
              name: id.toLowerCase(),
              is_channel: true,
            })),
          };
        case "conversations.history": {
          const channel = String(params.channel);
          if (data.failing?.[channel])
            throw new SlackError(data.failing[channel]);
          const oldest = params.oldest ? Number(params.oldest) : 0;
          const messages = data.history[channel]
            .filter((m) => Number(m.ts) >= oldest)
            .sort((a, b) => Number(b.ts) - Number(a.ts));
          return { ok: true, messages };
        }
        case "conversations.replies": {
          const key = `${params.channel}:${params.ts}`;
          const parent = data.history[String(params.channel)].find(
            (m) => m.ts === params.ts,
          )!;
          return {
            ok: true,
            messages: [parent, ...(data.replies?.[key] ?? [])],
          };
        }
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  return { client, calls };
}

const download = async (url: string) => new Blob([url]);
const manifestOf = async (folder: ReturnType<typeof memoryFolder>) =>
  JSON.parse((await folder.read("manifest.json"))!) as Manifest;

describe("monthKey", () => {
  it("uses Korea time", () => {
    expect(monthKey(ts("2026-06-30T16:00:00Z"))).toBe("2026-07");
    expect(monthKey(ts("2026-06-30T14:00:00Z"))).toBe("2026-06");
  });
});

describe("mergeWindow", () => {
  it("keeps messages older than the window and replaces the rest", () => {
    const old = { ts: "100.0", text: "old" };
    const gone = { ts: "300.0", text: "deleted in slack" };
    const edited = { ts: "400.0", text: "v2" };
    expect(
      mergeWindow([old, gone, { ts: "400.0", text: "v1" }], [edited], "200"),
    ).toEqual([old, edited]);
    expect(mergeWindow([old, gone], [edited], undefined)).toEqual([edited]);
  });
});

describe("runExport", () => {
  const june = ts("2026-06-10T03:00:00Z");
  const july = ts("2026-07-10T03:00:00Z");
  const reply = ts("2026-07-11T03:00:00Z");

  it("writes metadata, month files with nested replies, files and emoji", async () => {
    const folder = memoryFolder();
    const { client } = fakeSlack({
      history: {
        C1: [
          {
            ts: june,
            user: "U1",
            text: "hi",
            files: [
              {
                id: "F1",
                name: "a/b.png",
                url_private_download: "https://files.slack.com/F1",
              },
            ],
          },
          {
            ts: july,
            user: "U1",
            text: "thread",
            reply_count: 1,
            thread_ts: july,
          },
        ],
      },
      replies: {
        [`C1:${july}`]: [
          { ts: reply, user: "U1", text: "reply", thread_ts: july },
        ],
      },
    });
    const manifest = await runExport({ client, folder, download });

    expect(manifest.finishedAt).not.toBeNull();
    expect(manifest.conversations.C1).toMatchObject({
      done: true,
      latestTs: july,
      months: ["2026-06", "2026-07"],
    });
    const julyFile = JSON.parse(
      (await folder.read("messages/C1/2026-07.json"))!,
    );
    expect(julyFile[0].replies.map((m: SlackMessage) => m.text)).toEqual([
      "reply",
    ]);
    expect(folder.files.has("files/F1/a_b.png")).toBe(true);
    expect(folder.files.has("emoji/party.gif")).toBe(true);
    expect(JSON.parse((await folder.read("emoji.json"))!)).toEqual({
      party: "emoji/party.gif",
      yay: "alias:party",
    });
    expect(
      folder.files.has("users.json") && folder.files.has("conversations.json"),
    ).toBe(true);
    expect(
      JSON.parse((await folder.read("usergroups.json"))!)[0],
    ).toMatchObject({ id: "S1", handle: "cm" });
  });

  it("keeps going without user groups when the token lacks usergroups:read", async () => {
    const folder = memoryFolder();
    const { client } = fakeSlack({
      history: { C1: [{ ts: july, text: "a" }] },
      usergroupsError: "missing_scope",
    });
    const manifest = await runExport({ client, folder, download });
    expect(manifest.finishedAt).not.toBeNull();
    expect(folder.files.has("usergroups.json")).toBe(false);
  });

  it("resumes an interrupted run without refetching finished conversations", async () => {
    const folder = memoryFolder();
    const interrupted: Manifest = {
      version: 1,
      team: { id: "T1", name: "GH" },
      exportedBy: "U1",
      startedAt: "x",
      finishedAt: null,
      conversations: {
        C1: { done: true, latestTs: june, months: ["2026-06"] },
      },
    };
    await folder.write("manifest.json", JSON.stringify(interrupted));
    const { client, calls } = fakeSlack({
      history: { C1: [{ ts: june, text: "a" }], C2: [{ ts: june, text: "b" }] },
    });
    await runExport({ client, folder, download });
    const historyCalls = calls
      .filter((c) => c.method === "conversations.history")
      .map((c) => c.params.channel);
    expect(historyCalls).toEqual(["C2"]);
  });

  it("re-sync fetches from 30 days before the latest message and drops messages deleted in that window", async () => {
    const folder = memoryFolder();
    const early = ts("2026-05-01T03:00:00Z");
    const recent = ts("2026-06-20T03:00:00Z");
    const { client } = fakeSlack({
      history: {
        C1: [
          { ts: early, text: "early" },
          { ts: recent, text: "to delete" },
          { ts: july, text: "v1" },
        ],
      },
    });
    await runExport({ client, folder, download });

    const second = fakeSlack({
      history: {
        C1: [
          { ts: early, text: "early" },
          { ts: july, text: "v2", edited: { ts: july } },
        ],
      },
    });
    const manifest = await runExport({
      client: second.client,
      folder,
      download,
    });

    const history = second.calls.find(
      (c) => c.method === "conversations.history",
    )!;
    expect(Number(history.params.oldest)).toBe(Number(july) - OVERLAP_SECONDS);
    const juneFile = JSON.parse(
      (await folder.read("messages/C1/2026-06.json"))!,
    );
    expect(juneFile).toEqual([]);
    expect(manifest.conversations.C1.months).toEqual(["2026-05", "2026-07"]);
    expect(
      JSON.parse((await folder.read("messages/C1/2026-07.json"))!)[0].text,
    ).toBe("v2");
    expect(
      JSON.parse((await folder.read("messages/C1/2026-05.json"))!)[0].text,
    ).toBe("early");
  });

  it("full re-sync fetches everything", async () => {
    const folder = memoryFolder();
    const { client } = fakeSlack({
      history: { C1: [{ ts: july, text: "a" }] },
    });
    await runExport({ client, folder, download });
    const second = fakeSlack({ history: { C1: [{ ts: july, text: "a" }] } });
    await runExport({ client: second.client, folder, download, full: true });
    expect(
      second.calls.find((c) => c.method === "conversations.history")!.params
        .oldest,
    ).toBeUndefined();
  });

  it("records a conversation that fails and keeps going", async () => {
    const folder = memoryFolder();
    const { client } = fakeSlack({
      history: { C1: [], C2: [{ ts: july, text: "ok" }] },
      failing: { C1: "channel_not_found" },
    });
    const manifest = await runExport({ client, folder, download });
    expect(manifest.conversations.C1).toMatchObject({
      done: true,
      error: "channel_not_found",
    });
    expect(manifest.conversations.C2.months).toEqual(["2026-07"]);
  });

  it("stops on a revoked token and leaves the run resumable", async () => {
    const folder = memoryFolder();
    const { client } = fakeSlack({
      history: { C1: [{ ts: july, text: "a" }], C2: [] },
      failing: { C2: "token_revoked" },
    });
    await expect(runExport({ client, folder, download })).rejects.toThrow(
      "token_revoked",
    );
    const manifest = await manifestOf(folder);
    expect(manifest.finishedAt).toBeNull();
    expect(manifest.conversations.C1.done).toBe(true);
  });

  it("marks a file that cannot be downloaded without failing the conversation", async () => {
    const folder = memoryFolder();
    const { client } = fakeSlack({
      history: {
        C1: [
          {
            ts: july,
            files: [
              {
                id: "F9",
                name: "x.pdf",
                url_private: "https://files.slack.com/F9",
              },
            ],
          },
        ],
      },
    });
    const manifest = await runExport({
      client,
      folder,
      download: async () => Promise.reject(new Error("404")),
    });
    expect(manifest.conversations.C1.error).toBeUndefined();
    expect(folder.files.has("files/F9/x.pdf")).toBe(false);
  });
});

describe("createSlackClient", () => {
  it("sends the token as a form field and waits Retry-After on 429", async () => {
    const waits: number[] = [];
    const bodies: string[] = [];
    let first = true;
    const fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      if (first) {
        first = false;
        return new Response("", {
          status: 429,
          headers: { "retry-after": "7" },
        });
      }
      return Response.json({ ok: true, value: 1 });
    }) as unknown as typeof globalThis.fetch;
    const client = createSlackClient("xoxp-1", {
      fetch,
      sleep: async (ms) => void waits.push(ms),
    });
    expect((await client.call("auth.test", { a: 1, b: undefined })).value).toBe(
      1,
    );
    expect(waits).toEqual([7000]);
    expect(bodies[1]).toBe("token=xoxp-1&a=1");
  });

  it("throws SlackError with the Slack error code", async () => {
    const fetch = (async () =>
      Response.json({
        ok: false,
        error: "missing_scope",
      })) as unknown as typeof globalThis.fetch;
    await expect(
      createSlackClient("t", { fetch }).call("x"),
    ).rejects.toMatchObject({ code: "missing_scope" });
  });
});
