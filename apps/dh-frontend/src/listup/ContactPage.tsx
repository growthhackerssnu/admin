import { useState } from "react";
import type { Channel, Company, ContactTask, ListupState } from "./model";
import {
  draftFor,
  eligibleForBulkEmail,
  preferredRoute,
  quarterLabel,
} from "./model";

type Update = { id: string; patch: Partial<ContactTask> };
const statusText = {
  pending: "생성 대기",
  ready: "작성 완료",
  failed: "생성 실패",
};
function personOf(task: ContactTask, company: Company) {
  return company.people.find((person) => person.id === task.personId);
}
function canSend(task: ContactTask, company: Company) {
  const person = personOf(task, company);
  return (
    !task.sent &&
    task.status === "ready" &&
    !!task.subject.trim() &&
    !!task.body.trim() &&
    !!person &&
    !!task.channel &&
    !!(task.channel === "email" ? person.email : person.linkedin)
  );
}

export function ContactPage({
  state,
  setQuarter,
  updateTask,
  updateTasks,
  navigateSourcing,
  notify,
}: {
  state: ListupState;
  setQuarter: (quarter: string) => void;
  updateTask: (id: string, patch: Partial<ContactTask>) => void;
  updateTasks: (updates: Update[]) => void;
  navigateSourcing: () => void;
  notify: (message: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");
  const [route, setRoute] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [manualConfirm, setManualConfirm] = useState(false);
  const tasks = state.tasks.filter((task) => task.quarter === state.quarter);
  const companyOf = (task: ContactTask) =>
    state.companies.find((item) => item.id === task.companyId)!;
  const visible = tasks.filter((task) => {
    const company = companyOf(task);
    return (
      (!query || company.name.toLowerCase().includes(query.toLowerCase())) &&
      (filter === "all" || (filter === "done" ? !!task.sent : !task.sent)) &&
      (route === "all" || preferredRoute(company) === route)
    );
  });
  const task = tasks.find((item) => item.companyId === currentId);
  const company = task && companyOf(task);
  const readyBulk = tasks.filter(
    (item) =>
      selected.has(item.companyId) &&
      eligibleForBulkEmail(item, companyOf(item)),
  );
  function toggle(id: string) {
    setSelected((items) => {
      const next = new Set(items);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function open(id: string) {
    setCurrentId(id);
    setEditing(false);
    setPreview(false);
    setRegenOpen(false);
    window.scrollTo(0, 0);
  }
  function generate(ids: string[]) {
    const updates = ids.flatMap((id): Update[] => {
      const target = tasks.find((item) => item.companyId === id);
      if (!target || target.sent || target.status === "ready") return [];
      return [
        { id, patch: { status: "ready", ...draftFor(companyOf(target)) } },
      ];
    });
    if (updates.length) updateTasks(updates);
    notify(
      `${updates.length}개 초안을 준비했어요. 생성 API는 아직 연결되지 않았습니다.`,
    );
  }
  function recordSend(target: ContactTask, channel: Channel) {
    const recipient = personOf(target, companyOf(target));
    if (
      !recipient ||
      !canSend(target, companyOf(target)) ||
      target.channel !== channel
    )
      return;
    updateTask(target.companyId, {
      sent: {
        channel,
        recipient: recipient.name,
        subject: target.subject,
        body: target.body.replaceAll("{{수신자명}}", recipient.name),
        at: new Date().toLocaleString("ko-KR"),
      },
    });
    notify(
      channel === "email"
        ? "이메일 발송을 시뮬레이션했어요. 실제 메일은 전송되지 않았습니다."
        : "LinkedIn 수동 전송 기록을 저장했어요.",
    );
  }
  function bulkEmail() {
    const updates: Update[] = readyBulk.map((item) => {
      const recipient = personOf(item, companyOf(item))!;
      return {
        id: item.companyId,
        patch: {
          sent: {
            channel: "email",
            recipient: recipient.name,
            subject: item.subject,
            body: item.body.replaceAll("{{수신자명}}", recipient.name),
            at: new Date().toLocaleString("ko-KR"),
          },
        },
      };
    });
    if (updates.length) updateTasks(updates);
    setSelected(new Set());
    notify(
      `${updates.length}개 이메일 발송을 시뮬레이션했어요. 실제 발송은 하지 않았습니다.`,
    );
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label}을 복사했어요.`);
    } catch {
      notify("복사가 제한되었습니다. 본문을 직접 선택해 복사해주세요.");
    }
  }
  if (task && company) {
    const recipient = personOf(task, company);
    const message =
      task.sent?.body ||
      (preview && recipient
        ? task.body.replaceAll("{{수신자명}}", recipient.name)
        : task.body);
    const locked = !!task.sent;
    return (
      <main className="lu-main">
        <div className="lu-detail-title">
          <button
            className="lu-text-button"
            onClick={() => {
              if (editing && !window.confirm("저장하지 않은 변경을 버릴까요?"))
                return;
              setCurrentId(null);
            }}
          >
            ← 컨택 작업 목록
          </button>
          <h1>{company.name}</h1>
          <p className="lu-muted">
            {quarterLabel(state.quarter)} · {company.area}
          </p>
        </div>
        {task.status !== "ready" ? (
          <section className="lu-surface lu-detail-empty">
            <h2>
              {task.status === "failed"
                ? "초안 생성에 실패했어요"
                : "아직 초안이 없어요"}
            </h2>
            <p className="lu-muted">
              공통 양식을 바탕으로 기업별 초안을 준비합니다.
            </p>
            <button
              className="lu-primary"
              onClick={() => generate([company.id])}
            >
              초안 생성
            </button>
          </section>
        ) : (
          <div className="lu-detail-grid">
            <section className="lu-surface">
              <div className="lu-section-head">
                <h2>{locked ? "전송한 메시지" : "메시지"}</h2>
                {!locked && (
                  <div className="lu-button-group">
                    {editing ? (
                      <>
                        <button
                          className="lu-primary"
                          disabled={!editSubject.trim() || !editBody.trim()}
                          onClick={() => {
                            updateTask(company.id, {
                              subject: editSubject,
                              body: editBody,
                            });
                            setEditing(false);
                          }}
                        >
                          저장
                        </button>
                        <button onClick={() => setEditing(false)}>취소</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditSubject(task.subject);
                            setEditBody(task.body);
                            setEditing(true);
                            setPreview(false);
                          }}
                        >
                          수정
                        </button>
                        <button onClick={() => setRegenOpen((value) => !value)}>
                          다시 생성
                        </button>
                      </>
                    )}
                    <button onClick={() => setPreview((value) => !value)}>
                      {preview ? "수신자 반영 해제" : "수신자 반영 보기"}
                    </button>
                  </div>
                )}
              </div>
              {regenOpen && !locked && !editing && (
                <div className="lu-regen">
                  <label htmlFor="lu-regen-prompt">
                    다시 생성할 때 반영할 요청
                  </label>
                  <textarea
                    id="lu-regen-prompt"
                    value={regenPrompt}
                    onChange={(event) => setRegenPrompt(event.target.value)}
                    placeholder="예: 제안을 좀 더 간결하게 써줘"
                  />
                  <div className="lu-dialog-actions">
                    <button onClick={() => setRegenOpen(false)}>취소</button>
                    <button
                      className="lu-primary"
                      disabled={!regenPrompt.trim()}
                      onClick={() => {
                        const draft = draftFor(company);
                        updateTask(company.id, {
                          subject: draft.subject,
                          body: `${draft.body}\n\n추가 요청: ${regenPrompt.trim()}`,
                        });
                        setRegenOpen(false);
                        setRegenPrompt("");
                        notify(
                          "예시 초안을 다시 만들었어요. 생성 API는 미연결입니다.",
                        );
                      }}
                    >
                      다시 생성
                    </button>
                  </div>
                </div>
              )}
              <label className="lu-field">
                제목
                <input
                  value={
                    editing ? editSubject : task.sent?.subject || task.subject
                  }
                  readOnly={!editing || preview}
                  onChange={(event) => setEditSubject(event.target.value)}
                />
              </label>
              <label className="lu-field">
                본문
                {editing && !preview ? (
                  <textarea
                    className="lu-editor"
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                  />
                ) : (
                  <div className="lu-preview">{message}</div>
                )}
              </label>
              <p className="lu-muted">
                {locked
                  ? "전송 당시 메시지입니다. 이 기록은 수정할 수 없습니다."
                  : editing
                    ? "저장 전에는 전송할 수 없습니다."
                    : "읽기 전용 · 수정 버튼을 눌러 편집하세요."}
              </p>
              <details className="lu-history">
                <summary>기업 조사 근거 보기</summary>
                <p>{company.possibility}</p>
                <p>{company.value}</p>
              </details>
            </section>
            <aside className="lu-surface">
              <div className="lu-section-head">
                <h2>수신자 · 전송 경로</h2>
                <span className={`lu-tag ${locked ? "fit" : "pending"}`}>
                  {locked ? "전송 완료" : "미전송"}
                </span>
              </div>
              <div className="lu-callout">
                {preferredRoute(company) === "linkedin"
                  ? "LinkedIn 우선 · 직접 복사해 전송합니다."
                  : "이메일만 확보 · 발송 연동 전에는 시뮬레이션합니다."}
              </div>
              {company.people.map((person) => (
                <label
                  key={person.id}
                  className={`lu-recipient ${task.personId === person.id ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="recipient"
                    checked={task.personId === person.id}
                    disabled={locked || editing}
                    onChange={() =>
                      updateTask(company.id, {
                        personId: person.id,
                        channel: person.linkedin
                          ? "linkedin"
                          : person.email
                            ? "email"
                            : null,
                      })
                    }
                  />
                  <span>
                    <strong>{person.name}</strong> · {person.role}
                    <small>
                      {[person.email && "이메일", person.linkedin && "LinkedIn"]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </label>
              ))}
              {recipient && (
                <>
                  <h3 className="lu-mini-heading">연락 경로</h3>
                  <div className="lu-radio-row">
                    {recipient.linkedin && (
                      <label>
                        <input
                          type="radio"
                          name="channel"
                          checked={task.channel === "linkedin"}
                          disabled={locked || editing}
                          onChange={() =>
                            updateTask(company.id, { channel: "linkedin" })
                          }
                        />{" "}
                        LinkedIn
                      </label>
                    )}
                    {recipient.email && (
                      <label>
                        <input
                          type="radio"
                          name="channel"
                          checked={task.channel === "email"}
                          disabled={locked || editing}
                          onChange={() =>
                            updateTask(company.id, { channel: "email" })
                          }
                        />{" "}
                        이메일
                      </label>
                    )}
                  </div>
                </>
              )}
              {task.channel === "linkedin" && !locked && (
                <div className="lu-manual">
                  <strong>LinkedIn 수동 전송</strong>
                  <p className="lu-muted">
                    제목과 본문을 복사해 직접 전송해주세요.
                  </p>
                  <div className="lu-button-group">
                    <button
                      disabled={!canSend(task, company) || editing}
                      onClick={() => void copy(task.subject, "제목")}
                    >
                      제목 복사
                    </button>
                    <button
                      className="lu-primary"
                      disabled={!canSend(task, company) || editing}
                      onClick={() =>
                        void copy(
                          task.body.replaceAll(
                            "{{수신자명}}",
                            recipient?.name || "{{수신자명}}",
                          ),
                          "본문",
                        )
                      }
                    >
                      본문 복사
                    </button>
                  </div>
                  {recipient?.linkedin && (
                    <button
                      className="lu-text-button"
                      onClick={() =>
                        notify(
                          "가상 관계자라 실제 LinkedIn 프로필 URL은 연결되지 않았습니다.",
                        )
                      }
                    >
                      프로필 열기 (예시)
                    </button>
                  )}
                </div>
              )}
              {!locked && (
                <div className="lu-send-actions">
                  {task.channel === "linkedin" ? (
                    <button
                      className="lu-primary lu-wide"
                      disabled={!canSend(task, company) || editing}
                      onClick={() => setManualConfirm(true)}
                    >
                      전송 완료로 표시
                    </button>
                  ) : (
                    <button
                      className="lu-primary lu-wide"
                      disabled={!canSend(task, company) || editing}
                      onClick={() => recordSend(task, "email")}
                    >
                      이메일 발송 (시뮬레이션)
                    </button>
                  )}
                </div>
              )}
              {locked && (
                <p className="lu-muted">
                  {task.sent?.at} ·{" "}
                  {task.sent?.channel === "linkedin"
                    ? "사용자 수동 전송 기록"
                    : "이메일 발송 시뮬레이션"}
                </p>
              )}
            </aside>
          </div>
        )}
        {manualConfirm && (
          <div
            className="lu-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setManualConfirm(false);
            }}
          >
            <section
              className="lu-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="LinkedIn 전송 확인"
            >
              <h2>LinkedIn 전송 기록</h2>
              <p>
                {company.name}의 {recipient?.name}님께 직접 전송했나요?
              </p>
              <p className="lu-muted">
                전송 여부는 자동 확인할 수 없습니다. 이 동작은 기록만
                저장합니다.
              </p>
              <div className="lu-dialog-actions">
                <button onClick={() => setManualConfirm(false)}>취소</button>
                <button
                  className="lu-primary"
                  onClick={() => {
                    recordSend(task, "linkedin");
                    setManualConfirm(false);
                  }}
                >
                  직접 전송했어요
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }
  return (
    <main className="lu-main">
      <div className="lu-page-title">
        <div>
          <h1>컨택 작업</h1>
          <p className="lu-muted">
            메시지를 다듬고, 관계자를 선택해 컨택을 마무리하세요.
          </p>
        </div>
        <span className="lu-quarter-pill">{quarterLabel(state.quarter)}</span>
      </div>
      <section className="lu-surface lu-contact-list">
        <div className="lu-list-heading">
          <strong>
            신규 탐색 기업 <span className="lu-muted">· {tasks.length}개</span>
          </strong>
          <span className="lu-muted">
            전송 완료 {tasks.filter((item) => item.sent).length} /{" "}
            {tasks.length}
          </span>
        </div>
        <div className="lu-tabs">
          {(["all", "todo", "done"] as const).map((value) => (
            <button
              className={filter === value ? "active" : ""}
              key={value}
              onClick={() => setFilter(value)}
            >
              {value === "all"
                ? "전체"
                : value === "todo"
                  ? "미전송"
                  : "전송 완료"}{" "}
              <span>
                {
                  tasks.filter(
                    (item) =>
                      value === "all" ||
                      (value === "done" ? !!item.sent : !item.sent),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="lu-toolbar">
          <input
            type="search"
            aria-label="기업 검색"
            placeholder="기업 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="lu-spacer" />
          <label className="lu-route-filter">
            작업 경로{" "}
            <select
              value={route}
              onChange={(event) => setRoute(event.target.value)}
            >
              <option value="all">전체</option>
              <option value="linkedin">LinkedIn</option>
              <option value="email">이메일만</option>
            </select>
          </label>
        </div>
        <div className="lu-contact-bulk">
          <strong>{selected.size}개 선택</strong>
          <button
            disabled={!selected.size}
            onClick={() => generate([...selected])}
          >
            초안 생성·재시도
          </button>
          <button disabled={!readyBulk.length} onClick={bulkEmail}>
            이메일 일괄 발송 ({readyBulk.length})
          </button>
        </div>
        <div className="lu-table-scroll">
          <table className="lu-table lu-contact-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="현재 목록 전체 선택"
                    checked={
                      visible.length > 0 &&
                      visible.every((item) => selected.has(item.companyId))
                    }
                    onChange={() => {
                      const next = new Set(selected);
                      if (visible.every((item) => next.has(item.companyId)))
                        visible.forEach((item) => next.delete(item.companyId));
                      else visible.forEach((item) => next.add(item.companyId));
                      setSelected(next);
                    }}
                  />
                </th>
                <th>기업 / 제안 영역</th>
                <th>초안</th>
                <th>추천 경로</th>
                <th>수신자</th>
                <th>컨택 상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const target = companyOf(item);
                const recipient = personOf(item, target);
                return (
                  <tr key={item.companyId}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${target.name} 선택`}
                        checked={selected.has(item.companyId)}
                        onChange={() => toggle(item.companyId)}
                      />
                    </td>
                    <td>
                      <strong>{target.name}</strong>
                      <small>{target.area}</small>
                    </td>
                    <td>
                      <span
                        className={`lu-tag ${item.status === "ready" ? "fit" : item.status === "failed" ? "unfit" : "pending"}`}
                      >
                        {statusText[item.status]}
                      </span>
                    </td>
                    <td>
                      {preferredRoute(target) === "linkedin"
                        ? "LinkedIn"
                        : "이메일"}
                    </td>
                    <td>
                      {recipient ? (
                        <>
                          {recipient.name}
                          <small>
                            {item.channel === "email"
                              ? "이메일"
                              : item.channel === "linkedin"
                                ? "LinkedIn"
                                : "경로 미선택"}
                          </small>
                        </>
                      ) : (
                        <span className="lu-muted">미선택</span>
                      )}
                    </td>
                    <td>
                      {item.sent ? (
                        <span className="lu-tag fit">
                          {item.sent.channel === "email"
                            ? "이메일 발송 완료"
                            : "LinkedIn 수동 전송"}
                        </span>
                      ) : (
                        <span className="lu-muted">미전송</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="lu-text-button"
                        onClick={() => open(item.companyId)}
                      >
                        {item.sent ? "전송 기록 →" : "작업 열기 →"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!tasks.length && (
          <div className="lu-empty">
            아직 컨택 작업에 추가된 기업이 없어요.{" "}
            <button className="lu-text-button" onClick={navigateSourcing}>
              기업 탐색에서 후보 추가하기 →
            </button>
          </div>
        )}
        {tasks.length > 0 && !visible.length && (
          <div className="lu-empty">조건에 맞는 기업이 없어요.</div>
        )}
      </section>
    </main>
  );
}
