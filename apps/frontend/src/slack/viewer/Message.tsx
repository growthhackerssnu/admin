import { useMemo, type ReactNode } from "react";
import { Tooltip } from "antd";
import { FileText } from "lucide-react";
import type { SlackFile, SlackMessage, SlackReaction } from "../types";
import { filePath } from "../exporter";
import {
  conversationLabel,
  messageAuthor,
  timeLabel,
  useFileUrl,
  userName,
  type ExportData,
} from "./data";
import { Mrkdwn, type MrkdwnContext } from "./mrkdwn";
import { standardEmoji } from "./emoji";

function CustomEmoji({
  data,
  name,
  depth = 0,
}: {
  data: ExportData;
  name: string;
  depth?: number;
}): ReactNode {
  const entry = data.emoji[name];
  const alias = entry?.startsWith("alias:") ? entry.slice(6) : undefined;
  const url = useFileUrl(data.folder, entry && !alias ? entry : undefined);
  if (alias)
    return depth < 3 ? (
      <EmojiChar data={data} name={alias} depth={depth + 1} />
    ) : (
      `:${name}:`
    );
  return url ? (
    <img
      className="slk-emoji"
      src={url}
      alt={`:${name}:`}
      title={`:${name}:`}
    />
  ) : (
    `:${name}:`
  );
}

export function EmojiChar({
  data,
  name,
  depth = 0,
}: {
  data: ExportData;
  name: string;
  depth?: number;
}) {
  const char = standardEmoji(name);
  if (char) return <span title={`:${name}:`}>{char}</span>;
  return <CustomEmoji data={data} name={name} depth={depth} />;
}

export function useMrkdwnContext(data: ExportData): MrkdwnContext {
  return useMemo(
    () => ({
      userName: (id) => userName(data, id),
      userGroupName: (id) => data.userGroups.get(id) ?? null,
      channelName: (id) => {
        const c = data.conversations.find((x) => x.id === id);
        return c ? conversationLabel(data, c) : id;
      },
      emoji: (name) =>
        standardEmoji(name) || data.emoji[name] ? (
          <EmojiChar data={data} name={name} />
        ) : null,
    }),
    [data],
  );
}

export function Avatar({
  data,
  userId,
}: {
  data: ExportData;
  userId?: string;
}) {
  const image = userId ? data.users.get(userId)?.profile?.image_72 : undefined;
  const ext = image?.split("?")[0].match(/\.(\w{2,5})$/)?.[1] ?? "png";
  const url = useFileUrl(
    data.folder,
    image ? `avatars/${userId}.${ext}` : undefined,
  );
  return url ? (
    <img className="slk-avatar" src={url} alt="" />
  ) : (
    <span className="slk-avatar slk-avatar-empty" />
  );
}

function FileView({ data, file }: { data: ExportData; file: SlackFile }) {
  const missing = file.mode === "tombstone" || file.mode === "hidden_by_limit";
  const url = useFileUrl(data.folder, missing ? undefined : filePath(file));
  const name = file.title || file.name || "파일";
  if (url && file.mimetype?.startsWith("image/"))
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img className="slk-image" src={url} alt={name} />
      </a>
    );
  if (url && file.mimetype?.startsWith("video/"))
    return <video className="slk-image" src={url} controls />;
  return (
    <a
      className={`slk-file${url ? "" : " slk-file-missing"}`}
      href={url ?? undefined}
      download={url ? file.name : undefined}
    >
      <FileText size={18} />
      <span>
        <b>{name}</b>
        <small>
          {url === null
            ? "파일을 불러올 수 없음"
            : (file.filetype ?? "").toUpperCase()}
        </small>
      </span>
    </a>
  );
}

// 슬랙처럼 "민아, 이준님이 :+1: 반응". 슬랙이 users를 일부만 줄 때는 나머지를 "외 N명"으로.
function ReactionChip({
  data,
  reaction,
}: {
  data: ExportData;
  reaction: SlackReaction;
}) {
  const users = reaction.users ?? [];
  const names = users.map((u) => userName(data, u)).join(", ");
  const rest = reaction.count - users.length;
  const title = (
    <span className="slk-reaction-tip">
      <span className="slk-reaction-tip-emoji">
        <EmojiChar data={data} name={reaction.name} />
      </span>
      <span>
        {names || "누군가"}
        {rest > 0 && ` 외 ${rest}명`}님이 :{reaction.name}: 반응
      </span>
    </span>
  );
  return (
    <Tooltip title={title} mouseEnterDelay={0.1}>
      <span className="slk-reaction" tabIndex={0}>
        <EmojiChar data={data} name={reaction.name} /> {reaction.count}
      </span>
    </Tooltip>
  );
}

export function MessageView({
  data,
  ctx,
  message,
  compact,
  focused,
  onOpenThread,
}: {
  data: ExportData;
  ctx: MrkdwnContext;
  message: SlackMessage;
  compact: boolean;
  focused?: boolean;
  onOpenThread?: (message: SlackMessage) => void;
}) {
  return (
    <div
      className={`slk-message${compact ? " slk-compact" : ""}${focused ? " slk-focused" : ""}`}
      data-ts={message.ts}
    >
      <div className="slk-gutter">
        {compact ? (
          <span className="slk-hover-time">{timeLabel(message.ts)}</span>
        ) : (
          <Avatar data={data} userId={message.user} />
        )}
      </div>
      <div className="slk-body">
        {!compact && (
          <div className="slk-meta">
            <b>{messageAuthor(data, message)}</b>
            <span>{timeLabel(message.ts)}</span>
          </div>
        )}
        {message.text && (
          <div className="slk-text">
            <Mrkdwn text={message.text} ctx={ctx} />
            {message.edited && <span className="slk-edited"> (편집됨)</span>}
          </div>
        )}
        {message.files?.map((file) => (
          <FileView key={file.id} data={data} file={file} />
        ))}
        {!!message.reactions?.length && (
          <div className="slk-reactions">
            {message.reactions.map((r) => (
              <ReactionChip key={r.name} data={data} reaction={r} />
            ))}
          </div>
        )}
        {!!message.replies?.length && onOpenThread && (
          <button
            type="button"
            className="slk-replies"
            onClick={() => onOpenThread(message)}
          >
            답글 {message.replies.length}개
          </button>
        )}
      </div>
    </div>
  );
}

/** 같은 사람이 5분 안에 이어 쓴 메시지는 이름·사진 없이 붙인다. */
export const isCompact = (
  previous: SlackMessage | undefined,
  message: SlackMessage,
) =>
  !!previous &&
  !previous.subtype &&
  !message.subtype &&
  previous.user === message.user &&
  Number(message.ts) - Number(previous.ts) < 5 * 60;
