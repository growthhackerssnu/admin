// 슬랙 백업 본체. 브라우저에서 돌고, 슬랙 클라이언트·폴더·파일 받기를 넘겨받아서 테스트가 쉽다.
//
// 폴더 구조와 이어 하기·동기화 규칙은 docs/superpowers/specs/2026-10-11-slack-export-design.md.
// 요약: 대화 하나를 다 받으면 manifest에 done을 남긴다. 끊긴 실행(finishedAt=null)을 다시 열면 done인
// 대화는 건너뛴다. 끝난 실행 다음에는 대화마다 마지막 메시지 30일 전부터만 다시 받는다.
import {
  AUTH_ERRORS,
  paginate,
  SlackError,
  type SlackClient,
} from "./slackClient";
import { readJson, safeName, writeJson, type Folder } from "./folder";
import {
  compressedPath,
  compressImage,
  DEFAULT_FILE_OPTIONS,
  fileKind,
  filePath,
  savedFilePaths,
  type FileOptions,
} from "./files";
import type {
  ConversationState,
  Manifest,
  SlackConversation,
  SlackFile,
  SlackMessage,
  SlackUser,
} from "./types";

// ponytail: 30일 넘은 스레드에 새로 달린 답글은 일반 동기화로는 못 받는다. 필요하면 "전체 다시 받기".
export const OVERLAP_SECONDS = 30 * 24 * 60 * 60;
const KST = 9 * 60 * 60 * 1000;

export type Progress = {
  phase: "meta" | "messages" | "done";
  index: number;
  total: number;
  name: string;
  messages: number;
};

export type ExportOptions = {
  client: SlackClient;
  folder: Folder;
  /** 슬랙 파일 주소를 받아 내용을 돌려준다(백엔드 프록시 경유). */
  download: (url: string) => Promise<Blob>;
  full?: boolean;
  /** 받을 파일 종류와 사진 압축. 새 실행이면 manifest에 남겨서 이어 하기·동기화가 같은 설정을 쓴다. */
  fileOptions?: FileOptions;
  /** 사진 압축(테스트에서 바꿔 끼운다) */
  compress?: (blob: Blob) => Promise<Blob | null>;
  onProgress?: (progress: Progress) => void;
  signal?: AbortSignal;
};

export const monthKey = (ts: string) =>
  new Date(Number(ts) * 1000 + KST).toISOString().slice(0, 7);

// 그 달이 끝나는 시각(한국 시간 다음 달 1일 0시)의 슬랙 ts(초)
function monthEnd(month: string) {
  const [year, m] = month.split("-").map(Number);
  return (Date.UTC(year, m, 1) - KST) / 1000;
}

/** oldest 이전 메시지는 그대로 두고, 그 뒤는 새로 받은 것으로 바꾼다(그 사이 지워진 메시지는 빠진다). */
export function mergeWindow(
  existing: SlackMessage[],
  fetched: SlackMessage[],
  oldest: string | undefined,
) {
  const kept =
    oldest === undefined
      ? []
      : existing.filter((m) => Number(m.ts) < Number(oldest));
  return [...kept, ...fetched].sort((a, b) => Number(a.ts) - Number(b.ts));
}

const extension = (url: string, fallback: string) =>
  url.split("?")[0].match(/\.(\w{2,5})$/)?.[1] ?? fallback;

export const conversationName = (c: SlackConversation) =>
  c.name ?? c.user ?? c.id;

export async function runExport({
  client,
  folder,
  download,
  full = false,
  fileOptions,
  compress = compressImage,
  onProgress,
  signal,
}: ExportOptions): Promise<Manifest> {
  const auth = await client.call("auth.test");
  let manifest = await readJson<Manifest>(folder, "manifest.json");
  if (manifest && manifest.team.id !== auth.team_id) {
    throw new Error(
      `이 폴더는 다른 워크스페이스(${manifest.team.name})의 백업입니다.`,
    );
  }
  if (!manifest || manifest.finishedAt !== null) {
    // 새 실행. 지난 실행의 done은 지우고, 대화마다 받은 범위(latestTs, months)는 남긴다.
    const conversations: Record<string, ConversationState> = {};
    for (const [id, state] of Object.entries(manifest?.conversations ?? {}))
      conversations[id] = {
        latestTs: state.latestTs,
        months: state.months,
        done: false,
      };
    manifest = {
      version: 1,
      team: { id: auth.team_id, name: auth.team },
      exportedBy: auth.user_id,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      fullRun: full,
      fileOptions,
      conversations,
    };
  } else if (fileOptions) {
    manifest.fileOptions = fileOptions;
  }
  const run = manifest;
  const saveManifest = () => writeJson(folder, "manifest.json", run);
  await saveManifest();

  // ponytail: 파일은 하나씩 받는다. 느리면 동시 4개 정도로.
  async function saveFile(path: string, url: string | undefined) {
    if (!url || (await folder.exists(path))) return;
    try {
      await folder.write(path, await download(url));
    } catch {
      // 지워졌거나 권한이 없는 파일. 뷰어가 "파일을 불러올 수 없음"으로 보여준다.
    }
  }

  // 첨부 파일: 고른 종류만, 사진은 압축본(.webp)으로. 이미 받은 것(원본이든 압축본이든)은 건너뛴다.
  const options = run.fileOptions ?? DEFAULT_FILE_OPTIONS;
  async function saveMessageFile(file: SlackFile) {
    const url = file.url_private_download ?? file.url_private;
    const kind = fileKind(file);
    if (!url || !options[kind]) return;
    for (const path of savedFilePaths(file))
      if (await folder.exists(path)) return;
    try {
      const blob = await download(url);
      const target = options.compressPhotos ? compressedPath(file) : null;
      const smaller = target ? await compress(blob) : null;
      await folder.write(smaller ? target! : filePath(file), smaller ?? blob);
    } catch {
      // 지워졌거나 권한이 없는 파일. 뷰어가 "파일을 불러올 수 없음"으로 보여준다.
    }
  }

  onProgress?.({
    phase: "meta",
    index: 0,
    total: 0,
    name: "멤버·이모지·대화 목록",
    messages: 0,
  });
  const users = await paginate<SlackUser>(
    client,
    "users.list",
    {},
    "members",
    signal,
  );
  await writeJson(folder, "users.json", users);
  for (const user of users) {
    const url = user.profile?.image_72;
    if (url) await saveFile(`avatars/${user.id}.${extension(url, "png")}`, url);
  }

  const emoji = (await client.call("emoji.list")).emoji as Record<
    string,
    string
  >;
  const emojiMap: Record<string, string> = {};
  for (const [name, url] of Object.entries(emoji)) {
    if (url.startsWith("alias:")) emojiMap[name] = url;
    else {
      emojiMap[name] = `emoji/${safeName(name)}.${extension(url, "png")}`;
      await saveFile(emojiMap[name], url);
    }
  }
  await writeJson(folder, "emoji.json", emojiMap);

  // 본문의 <!subteam^S…> 태그(@cm 같은 사용자 그룹)를 이름으로 보이려고. 예전 로그인(usergroups:read 없음)이면 건너뛴다.
  try {
    const groups = await client.call("usergroups.list", {
      include_disabled: true,
    });
    await writeJson(folder, "usergroups.json", groups.usergroups ?? []);
  } catch (error) {
    if (!(error instanceof SlackError) || AUTH_ERRORS.has(error.code))
      throw error;
  }

  const conversations = await paginate<SlackConversation>(
    client,
    "conversations.list",
    {
      types: "public_channel,private_channel,mpim,im",
      exclude_archived: false,
    },
    "channels",
    signal,
  );
  await writeJson(folder, "conversations.json", conversations);

  let messageCount = 0;
  for (const [index, conversation] of conversations.entries()) {
    signal?.throwIfAborted();
    const state = (run.conversations[conversation.id] ??= {
      done: false,
      months: [],
    });
    if (state.done) continue;
    const progress = (messages: number) =>
      onProgress?.({
        phase: "messages",
        index: index + 1,
        total: conversations.length,
        name: conversationName(conversation),
        messages,
      });
    progress(messageCount);
    try {
      const oldest =
        !run.fullRun && state.latestTs
          ? String(Number(state.latestTs) - OVERLAP_SECONDS)
          : undefined;
      const fetched = await paginate<SlackMessage>(
        client,
        "conversations.history",
        { channel: conversation.id, oldest },
        "messages",
        signal,
      );
      for (const message of fetched) {
        if (message.reply_count && message.thread_ts === message.ts) {
          const thread = await paginate<SlackMessage>(
            client,
            "conversations.replies",
            { channel: conversation.id, ts: message.ts },
            "messages",
            signal,
          );
          message.replies = thread.filter((reply) => reply.ts !== message.ts);
        }
        messageCount += 1 + (message.replies?.length ?? 0);
        if (messageCount % 200 === 0) progress(messageCount);
      }

      for (const message of fetched) {
        for (const file of [message, ...(message.replies ?? [])].flatMap(
          (m) => m.files ?? [],
        )) {
          if (file.mode !== "tombstone" && file.mode !== "hidden_by_limit")
            await saveMessageFile(file);
        }
      }

      const byMonth = new Map<string, SlackMessage[]>();
      for (const message of fetched) {
        const key = monthKey(message.ts);
        byMonth.set(key, [...(byMonth.get(key) ?? []), message]);
      }
      const touched = new Set([
        ...byMonth.keys(),
        ...state.months.filter(
          (month) => oldest === undefined || monthEnd(month) > Number(oldest),
        ),
      ]);
      const months = new Set(state.months);
      for (const month of touched) {
        const path = `messages/${conversation.id}/${month}.json`;
        const existing = (await readJson<SlackMessage[]>(folder, path)) ?? [];
        const merged = mergeWindow(existing, byMonth.get(month) ?? [], oldest);
        await writeJson(folder, path, merged);
        if (merged.length) months.add(month);
        else months.delete(month);
      }
      state.months = [...months].sort();
      const latest = fetched.reduce(
        (max, m) => (Number(m.ts) > Number(max) ? m.ts : max),
        state.latestTs ?? "0",
      );
      if (latest !== "0") state.latestTs = latest;
      delete state.error;
    } catch (error) {
      if (!(error instanceof SlackError) || AUTH_ERRORS.has(error.code)) {
        await saveManifest();
        throw error;
      }
      state.error = error.code;
    }
    state.done = true;
    await saveManifest();
  }

  run.finishedAt = new Date().toISOString();
  await saveManifest();
  onProgress?.({
    phase: "done",
    index: conversations.length,
    total: conversations.length,
    name: "",
    messages: messageCount,
  });
  return run;
}
