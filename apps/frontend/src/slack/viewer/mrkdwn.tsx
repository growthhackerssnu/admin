// 슬랙 mrkdwn → React. 굵게·기울임·취소선·코드·코드 블록·인용·링크·멘션·이모지만 다룬다.
// 슬랙 원문은 < > &를 &lt; &gt; &amp;로 보내고, <...>는 링크·멘션 표시다.
import { Fragment, type ReactNode } from "react";

export type MrkdwnContext = {
  userName: (id: string) => string;
  channelName: (id: string) => string;
  /** 사용자 그룹(@cm) 핸들. 모르면 null */
  userGroupName: (id: string) => string | null;
  emoji: (name: string) => ReactNode | null;
};

const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const INLINE =
  /(`[^`\n]+`)|(<[^<>\n]+>)|((?<![\w*])\*[^*\n]+\*(?![\w*]))|((?<![\w_])_[^_\n]+_(?![\w_]))|((?<![\w~])~[^~\n]+~(?![\w~]))|((?<!\d):[^\s:<>`]+(?:::skin-tone-\d)?:)/g;

function link(inner: string, ctx: MrkdwnContext, key: number): ReactNode {
  const [target, label] = inner.split("|", 2);
  if (target.startsWith("@"))
    return (
      <span key={key} className="slk-mention">
        @{label ?? ctx.userName(target.slice(1))}
      </span>
    );
  if (target.startsWith("#"))
    return (
      <span key={key} className="slk-mention">
        #{label ?? ctx.channelName(target.slice(1))}
      </span>
    );
  if (target.startsWith("!subteam^")) {
    const name =
      label?.replace(/^@/, "") ??
      ctx.userGroupName(target.split("^")[1]) ??
      "그룹";
    return (
      <span key={key} className="slk-mention">
        @{unescape(name)}
      </span>
    );
  }
  if (target.startsWith("!")) {
    const special = target.slice(1).split("^")[0];
    const text =
      label ??
      (["here", "channel", "everyone"].includes(special)
        ? `@${special}`
        : special);
    return (
      <span key={key} className="slk-mention">
        {unescape(text)}
      </span>
    );
  }
  const href = unescape(target);
  if (!/^(https?:|mailto:|tel:)/i.test(href))
    return <Fragment key={key}>{unescape(label ?? href)}</Fragment>;
  return (
    <a key={key} href={href} target="_blank" rel="noreferrer">
      {unescape(label ?? href)}
    </a>
  );
}

function inline(text: string, ctx: MrkdwnContext): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index!;
    if (index > last) out.push(unescape(text.slice(last, index)));
    const token = match[0];
    const inner = token.slice(1, -1);
    if (match[1]) out.push(<code key={key++}>{unescape(inner)}</code>);
    else if (match[2]) out.push(link(inner, ctx, key++));
    else if (match[3]) out.push(<b key={key++}>{inline(inner, ctx)}</b>);
    else if (match[4]) out.push(<i key={key++}>{inline(inner, ctx)}</i>);
    else if (match[5]) out.push(<s key={key++}>{inline(inner, ctx)}</s>);
    else out.push(<Fragment key={key++}>{ctx.emoji(inner) ?? token}</Fragment>);
    last = index + token.length;
  }
  if (last < text.length) out.push(unescape(text.slice(last)));
  return out;
}

// 줄 단위: "&gt; "로 시작하는 연속 줄은 인용으로 묶는다.
function lines(text: string, ctx: MrkdwnContext, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const rows = text.split("\n");
  let quote: string[] = [];
  let plain: string[] = [];
  const flushPlain = () => {
    if (plain.length)
      out.push(
        <Fragment key={`${keyBase}p${out.length}`}>
          {plain.flatMap((row, i) =>
            i ? ["\n", ...inline(row, ctx)] : inline(row, ctx),
          )}
        </Fragment>,
      );
    plain = [];
  };
  const flushQuote = () => {
    if (quote.length)
      out.push(
        <blockquote key={`${keyBase}q${out.length}`}>
          {inline(quote.join("\n"), ctx)}
        </blockquote>,
      );
    quote = [];
  };
  for (const row of rows) {
    if (row.startsWith("&gt;")) {
      flushPlain();
      quote.push(row.replace(/^&gt;\s?/, ""));
    } else {
      flushQuote();
      plain.push(row);
    }
  }
  flushQuote();
  flushPlain();
  return out;
}

export function Mrkdwn({ text, ctx }: { text: string; ctx: MrkdwnContext }) {
  const parts = text.split(/```/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <pre key={i}>{unescape(part.replace(/^\n/, ""))}</pre>
        ) : (
          <Fragment key={i}>{lines(part, ctx, String(i))}</Fragment>
        ),
      )}
    </>
  );
}
