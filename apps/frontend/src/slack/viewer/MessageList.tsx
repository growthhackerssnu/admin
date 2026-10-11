import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SlackConversation, SlackMessage } from "../types";
import { dayKey, dayLabel, loadMonth, type ExportData } from "./data";
import { isCompact, MessageView, useMrkdwnContext } from "./Message";

export type Target = { conversationId: string; ts: string; nonce: number };

// 한 대화의 메시지. 한 번에 한 달씩 읽고, 위로 올리면 이전 달을 붙인다. 날짜로 이동하면 그 달부터 다시 읽는다.
export function MessageList({
  data,
  conversation,
  target,
  onOpenThread,
}: {
  data: ExportData;
  conversation: SlackConversation;
  target?: Target;
  onOpenThread: (message: SlackMessage) => void;
}) {
  const ctx = useMrkdwnContext(data);
  const months = data.manifest.conversations[conversation.id]?.months ?? [];
  // from..to = 읽어 둔 달의 범위(months 인덱스)
  const [loaded, setLoaded] = useState<{ from: number; to: number; messages: SlackMessage[] }>({ from: months.length, to: months.length - 1, messages: [] });
  const [focusTs, setFocusTs] = useState<string>();
  const scroller = useRef<HTMLDivElement>(null);
  const keepBottom = useRef<number | null>(null);
  const keepTop = useRef<number | null>(null);
  const loading = useRef(false);

  // 처음엔 마지막 달, 이동할 곳이 있으면 그 달부터.
  const targetTs = target?.conversationId === conversation.id ? target.ts : undefined;
  useEffect(() => {
    let alive = true;
    const startMonth = targetTs ? nearestMonth(months, new Date(Number(targetTs) * 1000 + 9 * 3600_000).toISOString().slice(0, 7)) : months.length - 1;
    if (startMonth < 0) return setLoaded({ from: 0, to: -1, messages: [] });
    // 날짜 이동은 그 달 뒤로도 읽어야 그날 뒤 메시지가 이어진다 — 그 달부터 끝까지는 무거우니 그 달 + 다음 달만.
    const indexes = targetTs ? [startMonth, startMonth + 1].filter((i) => i < months.length) : [startMonth];
    Promise.all(indexes.map((i) => loadMonth(data.folder, conversation.id, months[i]))).then((parts) => {
      if (!alive) return;
      keepBottom.current = null;
      setLoaded({ from: startMonth, to: indexes[indexes.length - 1], messages: parts.flat() });
      setFocusTs(targetTs);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, conversation.id, targetTs, target?.nonce]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepTop.current !== null) {
      el.scrollTop = keepTop.current;
      keepTop.current = null;
    } else if (focusTs) {
      const node = [...el.querySelectorAll<HTMLElement>("[data-ts]")].find((n) => Number(n.dataset.ts) >= Number(focusTs));
      node?.scrollIntoView({ block: "center" });
    } else if (keepBottom.current !== null) {
      el.scrollTop = el.scrollHeight - keepBottom.current;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [loaded, focusTs]);

  async function loadPrevious() {
    if (loading.current || loaded.from <= 0) return;
    loading.current = true;
    const previous = await loadMonth(data.folder, conversation.id, months[loaded.from - 1]);
    keepBottom.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
    keepTop.current = null;
    setFocusTs(undefined);
    setLoaded((current) => ({ ...current, from: current.from - 1, messages: [...previous, ...current.messages] }));
    loading.current = false;
  }

  // 날짜로 이동한 뒤 아래로 내리면 다음 달을 붙인다. 스크롤 위치는 그대로 둔다.
  async function loadNext() {
    if (loading.current || loaded.to >= months.length - 1) return;
    loading.current = true;
    const next = await loadMonth(data.folder, conversation.id, months[loaded.to + 1]);
    keepBottom.current = null;
    keepTop.current = scroller.current?.scrollTop ?? 0;
    setFocusTs(undefined);
    setLoaded((current) => ({ ...current, to: current.to + 1, messages: [...current.messages, ...next] }));
    loading.current = false;
  }

  const messages = loaded.messages;
  return (
    <div className="slk-messages" ref={scroller} onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop < 80) void loadPrevious();
        else if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) void loadNext();
      }}>
      {loaded.from > 0 ? (
        <button type="button" className="slk-load-more" onClick={loadPrevious}>
          {months[loaded.from - 1]} 불러오기
        </button>
      ) : (
        <div className="slk-start">{months.length ? "대화의 처음입니다." : "백업된 메시지가 없습니다."}</div>
      )}
      {messages.map((message, i) => {
        const previous = messages[i - 1];
        const newDay = !previous || dayKey(previous.ts) !== dayKey(message.ts);
        return (
          <Fragment key={message.ts}>
            {newDay && <div className="slk-day">{dayLabel(message.ts)}</div>}
            <MessageView
              data={data}
              ctx={ctx}
              message={message}
              compact={!newDay && isCompact(previous, message)}
              focused={focusTs === message.ts}
              onOpenThread={onOpenThread}
            />
          </Fragment>
        );
      })}
      {loaded.to < months.length - 1 && (
        <button type="button" className="slk-load-more" onClick={loadNext}>
          {months[loaded.to + 1]} 불러오기
        </button>
      )}
    </div>
  );
}

// month 이상인 첫 달(없으면 마지막 달)
function nearestMonth(months: string[], month: string) {
  const index = months.findIndex((m) => m >= month);
  return index === -1 ? months.length - 1 : index;
}
