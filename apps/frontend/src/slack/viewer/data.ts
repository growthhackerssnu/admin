// 뷰어가 백업 폴더에서 읽는 것들과 표시용 도우미.
import { useEffect, useState } from "react";
import { readJson, type Folder } from "../folder";
import type {
  Manifest,
  SlackConversation,
  SlackMessage,
  SlackUser,
  SlackUserGroup,
} from "../types";

export type ExportData = {
  folder: Folder;
  manifest: Manifest;
  users: Map<string, SlackUser>;
  usersByName: Map<string, SlackUser>;
  conversations: SlackConversation[];
  emoji: Record<string, string>;
  /** 사용자 그룹 id → 핸들(cm). 예전 백업엔 없을 수 있다. */
  userGroups: Map<string, string>;
};

export async function loadExport(folder: Folder): Promise<ExportData | null> {
  const manifest = await readJson<Manifest>(folder, "manifest.json");
  if (!manifest) return null;
  const users = (await readJson<SlackUser[]>(folder, "users.json")) ?? [];
  return {
    folder,
    manifest,
    users: new Map(users.map((u) => [u.id, u])),
    usersByName: new Map(users.map((u) => [u.name, u])),
    conversations:
      (await readJson<SlackConversation[]>(folder, "conversations.json")) ?? [],
    emoji: (await readJson<Record<string, string>>(folder, "emoji.json")) ?? {},
    userGroups: new Map(
      ((await readJson<SlackUserGroup[]>(folder, "usergroups.json")) ?? []).map(
        (g) => [g.id, g.handle],
      ),
    ),
  };
}

export const loadMonth = async (
  folder: Folder,
  conversationId: string,
  month: string,
) =>
  (await readJson<SlackMessage[]>(
    folder,
    `messages/${conversationId}/${month}.json`,
  )) ?? [];

export const userName = (data: ExportData, id: string | undefined) => {
  const user = id ? data.users.get(id) : undefined;
  return (
    user?.profile?.display_name ||
    user?.profile?.real_name ||
    user?.real_name ||
    user?.name ||
    id ||
    "알 수 없음"
  );
};

export function messageAuthor(data: ExportData, message: SlackMessage) {
  if (message.user) return userName(data, message.user);
  return (
    message.username ??
    (message.bot_profile as { name?: string } | undefined)?.name ??
    "봇"
  );
}

export function conversationLabel(data: ExportData, c: SlackConversation) {
  if (c.is_im) return userName(data, c.user);
  if (c.is_mpim) {
    // 그룹 DM 이름은 "mpdm-a--b--c-1" 모양이다.
    const names = (c.name ?? "")
      .replace(/^mpdm-/, "")
      .replace(/-\d+$/, "")
      .split("--");
    return names
      .map((n) =>
        data.usersByName.has(n)
          ? userName(data, data.usersByName.get(n)!.id)
          : n,
      )
      .join(", ");
  }
  return c.name ?? c.id;
}

// 폴더 안 파일 → blob URL. 같은 파일은 한 번만 만든다.
// ponytail: blob URL을 해제하지 않는다. 한 세션에서 아주 많은 파일을 열면 메모리가 늘어난다.
const urlCache = new WeakMap<Folder, Map<string, Promise<string | null>>>();
export function fileUrl(folder: Folder, path: string) {
  let cache = urlCache.get(folder);
  if (!cache) urlCache.set(folder, (cache = new Map()));
  let url = cache.get(path);
  if (!url) {
    url = folder
      .readBlob(path)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null));
    cache.set(path, url);
  }
  return url;
}

/** undefined = 읽는 중, null = 없음 */
export function useFileUrl(folder: Folder, path: string | undefined) {
  const [url, setUrl] = useState<string | null | undefined>();
  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    if (!path) return setUrl(null);
    fileUrl(folder, path).then((next) => alive && setUrl(next));
    return () => {
      alive = false;
    };
  }, [folder, path]);
  return url;
}

const KST = "Asia/Seoul";
export const dayKey = (ts: string) =>
  new Date(Number(ts) * 1000).toLocaleDateString("sv-SE", { timeZone: KST });
export const dayLabel = (ts: string) =>
  new Date(Number(ts) * 1000).toLocaleDateString("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
export const timeLabel = (ts: string) =>
  new Date(Number(ts) * 1000).toLocaleTimeString("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
  });
