import { useMemo, type ReactNode } from "react";
import { Tooltip } from "antd";
import { FileText } from "lucide-react";
import type { SlackFile, SlackMessage, SlackReaction } from "../types";
import { fileKind, savedFilePaths } from "../files";
import {
  avatarPaths,
  conversationLabel,
  dayLabel,
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
  message,
  small,
}: {
  data: ExportData;
  message: Pick<SlackMessage, "user" | "bot_id">;
  small?: boolean;
}) {
  const url = useFileUrl(data.folder, avatarPaths(data, message));
  const className = `slk-avatar${small ? " slk-avatar-small" : ""}`;
  return url ? (
    <img className={className} src={url} alt="" />
  ) : (
    <span className={`${className} slk-avatar-empty`} />
  );
}

// 슬랙처럼 답글 단 사람 사진(최대 5명) + "답글 N개" + 마지막 답글 시각
function RepliesBar({
  data,
  message,
  onOpen,
}: {
  data: ExportData;
  message: SlackMessage;
  onOpen: () => void;
}) {
  const replies = message.replies ?? [];
  const repliers = [
    ...new Map(
      replies.map((r) => [r.user ?? r.bot_id ?? r.username ?? r.ts, r]),
    ).values(),
  ].slice(0, 5);
  const last = replies[replies.length - 1];
  return (
    <button type="button" className="slk-replies" onClick={onOpen}>
      <span className="slk-reply-avatars">
        {repliers.map((r) => (
          <Avatar key={r.ts} data={data} message={r} small />
        ))}
      </span>
      <b>답글 {replies.length}개</b>
      {last && (
        <span className="slk-muted">
          마지막 답글 {dayLabel(last.ts)} {timeLabel(last.ts)}
        </span>
      )}
    </button>
  );
}

function FileView({ data, file }: { data: ExportData; file: SlackFile }) {
  const missing = file.mode === "tombstone" || file.mode === "hidden_by_limit";
  const url = useFileUrl(
    data.folder,
    missing ? undefined : savedFilePaths(file),
  );
  const name = file.title || file.name || "파일";
  const excluded = data.manifest.fileOptions?.[fileKind(file)] === false;
  if (url && file.mimetype?.startsWith("image/"))
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img className="slk-image" src={url} alt={name} />
      </a>
    );
  if (url && file.mimetype?.startsWith("video/"))
    return <video className="slk-image" src={url} controls />;
  // 백업에 없는 파일은 슬랙 원본으로 연결한다(슬랙에 로그인돼 있어야 열린다).
  return (
    <a
      className={`slk-file${url ? "" : " slk-file-missing"}`}
      href={url ?? file.permalink}
      download={url ? file.name : undefined}
      target={url ? undefined : "_blank"}
      rel="noreferrer"
    >
      <FileText size={18} />
      <span>
        <b>{name}</b>
        <small>
          {url === null
            ? `${excluded ? "백업에서 제외한 파일" : "파일을 불러올 수 없음"}${file.permalink ? " · 슬랙에서 열기" : ""}`
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
  onOpenBroadcastThread,
  inThread,
}: {
  data: ExportData;
  ctx: MrkdwnContext;
  message: SlackMessage;
  compact: boolean;
  focused?: boolean;
  onOpenThread?: (message: SlackMessage) => void;
  /** 채널에도 보낸 스레드 답글의 "스레드에 답글" 줄을 눌렀을 때(부모 ts) */
  onOpenBroadcastThread?: (threadTs: string) => void;
  /** 스레드 패널 안이면 "채널에도 보냄" 표시 */
  inThread?: boolean;
}) {
  const broadcast = message.subtype === "thread_broadcast";
  return (
    <div
      className={`slk-message${compact ? " slk-compact" : ""}${focused ? " slk-focused" : ""}`}
      data-ts={message.ts}
    >
      <div className="slk-gutter">
        {compact ? (
          <span className="slk-hover-time">{timeLabel(message.ts)}</span>
        ) : (
          <Avatar data={data} message={message} />
        )}
      </div>
      <div className="slk-body">
        {broadcast && !inThread && (
          <button
            type="button"
            className="slk-broadcast"
            onClick={() =>
              message.thread_ts && onOpenBroadcastThread?.(message.thread_ts)
            }
          >
            스레드에 답글:{" "}
            <span>
              {(message.root?.text ?? "").replace(/\s+/g, " ").slice(0, 80)}
            </span>
          </button>
        )}
        {!compact && (
          <div className="slk-meta">
            <b>{messageAuthor(data, message)}</b>
            <span>{timeLabel(message.ts)}</span>
            {broadcast && inThread && (
              <span className="slk-broadcast-tag">채널에도 보냄</span>
            )}
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
          <RepliesBar
            data={data}
            message={message}
            onOpen={() => onOpenThread(message)}
          />
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
