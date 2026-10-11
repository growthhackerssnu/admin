import { useEffect, useMemo, useState } from "react";
import { Input, Select } from "antd";
import type { SlackMessage } from "../types";
import { conversationLabel, dayLabel, loadMonth, messageAuthor, timeLabel, userName, type ExportData } from "./data";
import { Mrkdwn } from "./mrkdwn";
import { useMrkdwnContext } from "./Message";

type Entry = { conversationId: string; message: SlackMessage; parent?: SlackMessage; text: string };
export type SearchHit = { conversationId: string; ts: string; parent?: SlackMessage };

// 처음 열 때 모든 달 파일을 메모리에 읽어 두고, 대소문자 무시 부분 문자열로 찾는다(한국어도 그대로 된다).
// ponytail: 메모리 = 워크스페이스 크기. 수십만 건이 넘어 느려지면 대화별 색인 파일로.
async function buildIndex(data: ExportData, onProgress: (done: number, total: number) => void) {
  const entries: Entry[] = [];
  const ids = Object.keys(data.manifest.conversations);
  for (const [i, conversationId] of ids.entries()) {
    for (const month of data.manifest.conversations[conversationId].months) {
      for (const message of await loadMonth(data.folder, conversationId, month)) {
        entries.push({ conversationId, message, text: (message.text ?? "").toLowerCase() });
        for (const reply of message.replies ?? []) entries.push({ conversationId, message: reply, parent: message, text: (reply.text ?? "").toLowerCase() });
      }
    }
    onProgress(i + 1, ids.length);
  }
  return entries;
}

export function SearchPanel({ data, onPick }: { data: ExportData; onPick: (hit: SearchHit) => void }) {
  const ctx = useMrkdwnContext(data);
  const [entries, setEntries] = useState<Entry[]>();
  const [progress, setProgress] = useState("");
  const [query, setQuery] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [userId, setUserId] = useState<string>();

  useEffect(() => {
    let alive = true;
    buildIndex(data, (done, total) => alive && setProgress(`${done}/${total}개 대화 읽는 중`)).then((next) => alive && setEntries(next));
    return () => {
      alive = false;
    };
  }, [data]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!entries || (!q && !userId && !conversationId)) return [];
    return entries
      .filter((e) => (!q || e.text.includes(q)) && (!conversationId || e.conversationId === conversationId) && (!userId || e.message.user === userId))
      .sort((a, b) => Number(b.message.ts) - Number(a.message.ts))
      .slice(0, 200);
  }, [entries, query, conversationId, userId]);

  const conversationOptions = data.conversations
    .filter((c) => data.manifest.conversations[c.id]?.months.length)
    .map((c) => ({ value: c.id, label: conversationLabel(data, c) }));
  const userOptions = [...data.users.values()].filter((u) => !u.deleted).map((u) => ({ value: u.id, label: userName(data, u.id) }));

  return (
    <div className="slk-search">
      <Input.Search autoFocus allowClear placeholder="메시지 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="slk-search-filters">
        <Select allowClear showSearch optionFilterProp="label" placeholder="대화" options={conversationOptions} value={conversationId} onChange={setConversationId} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="보낸 사람" options={userOptions} value={userId} onChange={setUserId} />
      </div>
      {!entries ? (
        <p className="slk-muted">{progress || "검색 준비 중"}</p>
      ) : (
        <>
          {(query || userId || conversationId) && <p className="slk-muted">{hits.length === 200 ? "최근 200건" : `${hits.length}건`}</p>}
          <ul className="slk-hits">
            {hits.map((hit) => {
              const c = data.conversations.find((x) => x.id === hit.conversationId);
              return (
                <li key={`${hit.conversationId}-${hit.message.ts}`}>
                  <button type="button" onClick={() => onPick({ conversationId: hit.conversationId, ts: hit.message.ts, parent: hit.parent })}>
                    <span className="slk-muted">
                      {c ? conversationLabel(data, c) : hit.conversationId} · {dayLabel(hit.message.ts)} {timeLabel(hit.message.ts)}
                      {hit.parent && " · 스레드"}
                    </span>
                    <b>{messageAuthor(data, hit.message)}</b>
                    <span className="slk-hit-text">
                      <Mrkdwn text={hit.message.text ?? ""} ctx={ctx} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
