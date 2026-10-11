import { useMemo, useState } from "react";
import { Hash, Lock, Search, X } from "lucide-react";
import type { SlackConversation, SlackMessage } from "../types";
import { conversationLabel, type ExportData } from "./data";
import { MessageList, type Target } from "./MessageList";
import { isCompact, MessageView, useMrkdwnContext } from "./Message";
import { SearchPanel } from "./Search";

type Group = { title: string; items: SlackConversation[]; collapsed?: boolean };

function groups(data: ExportData): Group[] {
  const state = data.manifest.conversations;
  const visible = data.conversations
    .filter((c) => state[c.id]?.months.length)
    .sort(
      (a, b) =>
        Number(state[b.id]?.latestTs ?? 0) - Number(state[a.id]?.latestTs ?? 0),
    );
  const active = visible.filter((c) => !c.is_archived);
  return [
    {
      title: "채널",
      items: active.filter((c) => c.is_channel && !c.is_private),
    },
    {
      title: "비공개 채널",
      items: active.filter(
        (c) => !c.is_im && !c.is_mpim && (c.is_private || c.is_group),
      ),
    },
    {
      title: "다이렉트 메시지",
      items: active.filter((c) => c.is_im || c.is_mpim),
    },
    {
      title: "보관된 채널",
      items: visible.filter((c) => c.is_archived),
      collapsed: true,
    },
  ].filter((g) => g.items.length);
}

// 읽기 전용 슬랙 화면: 왼쪽 대화 목록, 가운데 메시지, 오른쪽 스레드·검색.
export function Viewer({ data }: { data: ExportData }) {
  const sidebar = useMemo(() => groups(data), [data]);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => sidebar[0]?.items[0]?.id,
  );
  const [target, setTarget] = useState<Target>();
  const [thread, setThread] = useState<{
    parent: SlackMessage;
    focusTs?: string;
  }>();
  const [searching, setSearching] = useState(false);
  const ctx = useMrkdwnContext(data);
  const selected = data.conversations.find((c) => c.id === selectedId);

  function open(id: string) {
    setSelectedId(id);
    setTarget(undefined);
    setThread(undefined);
  }

  function jumpToDate(date: string) {
    if (!selected || !date) return;
    // 그날 한국 시간 0시
    const ts = String((Date.parse(`${date}T00:00:00+09:00`) / 1000).toFixed(6));
    setTarget({ conversationId: selected.id, ts, nonce: Date.now() });
  }

  return (
    <div className={`slk-viewer${thread || searching ? " slk-with-side" : ""}`}>
      <nav className="slk-sidebar" aria-label="대화 목록">
        <div className="slk-team">{data.manifest.team.name}</div>
        {sidebar.map((group) => (
          <details key={group.title} open={!group.collapsed}>
            <summary>{group.title}</summary>
            {group.items.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === selectedId ? "slk-active" : ""}
                onClick={() => open(c.id)}
              >
                {c.is_im || c.is_mpim ? (
                  <span className="slk-dm-dot" />
                ) : c.is_private || c.is_group ? (
                  <Lock size={14} />
                ) : (
                  <Hash size={14} />
                )}
                <span>{conversationLabel(data, c)}</span>
              </button>
            ))}
          </details>
        ))}
      </nav>

      <section className="slk-main">
        <header className="slk-header">
          <b>
            {selected ? conversationLabel(data, selected) : "대화를 고르세요"}
          </b>
          {selected && (
            <label className="slk-date">
              날짜로 이동
              <input type="date" onChange={(e) => jumpToDate(e.target.value)} />
            </label>
          )}
          <button
            type="button"
            className="slk-icon-button"
            aria-label="검색"
            onClick={() => setSearching((v) => !v)}
          >
            <Search size={16} />
          </button>
        </header>
        {selected && (
          <MessageList
            key={selected.id}
            data={data}
            conversation={selected}
            target={target}
            onOpenThread={(parent) => {
              setSearching(false);
              setThread({ parent });
            }}
          />
        )}
      </section>

      {(thread || searching) && (
        <aside className="slk-side">
          <header className="slk-header">
            <b>{searching ? "검색" : "스레드"}</b>
            <button
              type="button"
              className="slk-icon-button"
              aria-label="닫기"
              onClick={() =>
                searching ? setSearching(false) : setThread(undefined)
              }
            >
              <X size={16} />
            </button>
          </header>
          {searching ? (
            <SearchPanel
              data={data}
              onPick={(hit) => {
                setSelectedId(hit.conversationId);
                setTarget({
                  conversationId: hit.conversationId,
                  ts: hit.parent?.ts ?? hit.ts,
                  nonce: Date.now(),
                });
                if (hit.parent) {
                  setSearching(false);
                  setThread({ parent: hit.parent, focusTs: hit.ts });
                }
              }}
            />
          ) : (
            thread && (
              <div className="slk-messages">
                <MessageView
                  data={data}
                  ctx={ctx}
                  message={thread.parent}
                  compact={false}
                />
                <div className="slk-day">
                  답글 {thread.parent.replies?.length ?? 0}개
                </div>
                {thread.parent.replies?.map((reply, i, all) => (
                  <MessageView
                    key={reply.ts}
                    data={data}
                    ctx={ctx}
                    message={reply}
                    compact={isCompact(all[i - 1], reply)}
                    focused={reply.ts === thread.focusTs}
                  />
                ))}
              </div>
            )
          )}
        </aside>
      )}
    </div>
  );
}
