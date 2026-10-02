import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  currentActor,
  researchLabels,
  reviewLabels,
  type Candidate,
  type ReviewData,
  type ReviewRepository,
} from "./contracts";
import { CandidateReview, SourceLink, type Change } from "./CandidateReview";
import { MessagePage } from "./MessagePage";
import { previewRepository } from "./previewRepository";
import { UnifiedReviewLoading, UnifiedReviewPanel } from "./UnifiedReviewPanel";
import "./review.css";

export default function ReviewWorkspace({
  repository = previewRepository,
}: {
  repository?: ReviewRepository;
}) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ReviewData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const reviewDirty = useRef(false);
  const trackDirty = useCallback((dirty: boolean) => {
    reviewDirty.current = dirty;
  }, []);
  const active = useRef(true);
  const operation = useRef<{ signature: string; key: string }>();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const tab = params.get("view") ?? "review";
  const filter = params.get("filter") ?? "ready";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const selected = data?.candidates.find(
    (item) => item.id === params.get("candidate"),
  );
  const message = data?.candidates.find(
    (item) => item.id === params.get("message"),
  );
  useLayoutEffect(() => {
    const split = document.querySelector<HTMLElement>(".rv-review-split");
    if (!split) return;
    const measure = () => {
      const top = split.getBoundingClientRect().top + window.scrollY;
      split.style.setProperty(
        "--rv-work-height",
        `${Math.max(280, window.innerHeight - top - 16)}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    const toolbar = document.querySelector(".rv-toolbar");
    if (toolbar) observer.observe(toolbar);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [data, tab]);
  const load = useCallback(async () => {
    try {
      const value = await repository.load();
      if (active.current) {
        setData(value);
        setError("");
      }
    } catch (error) {
      if (active.current)
        setError(
          error instanceof Error
            ? error.message
            : "자료를 불러오지 못했습니다.",
        );
    } finally {
      if (active.current) setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    active.current = true;
    void load();
    const changed = () => {
      if (!busy.current) void load();
    };
    window.addEventListener("storage", changed);
    return () => {
      active.current = false;
      window.removeEventListener("storage", changed);
    };
  }, [load]);
  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);
  const navigate = (patch: Record<string, string | null>) => {
    if (
      reviewDirty.current &&
      !window.confirm("저장하지 않은 입력을 버리고 이동할까요?")
    )
      return;
    reviewDirty.current = false;
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) =>
      value === null ? next.delete(key) : next.set(key, value),
    );
    setParams(next);
    setError("");
  };
  const perform = async (
    signature: string,
    action: (key: string) => Promise<ReviewData>,
  ): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    if (operation.current?.signature !== signature)
      operation.current = { signature, key: crypto.randomUUID() };
    try {
      const next = await action(operation.current.key);
      if (active.current) setData(next);
      operation.current = undefined;
      return true;
    } catch (error) {
      if (active.current)
        setError(
          error instanceof Error
            ? error.message
            : "저장하지 못했습니다. 입력은 유지됩니다.",
        );
      return false;
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };
  const change: Change = (candidate, command) => {
    if (tab === "review" && !params.get("message")) {
      const nextParams = new URLSearchParams(params);
      nextParams.set("candidate", candidate.id);
      setParams(nextParams, { replace: true });
    }
    return perform(
      JSON.stringify({ id: candidate.id, version: candidate.version, command }),
      (key) =>
        repository.execute(candidate.id, candidate.version, command, key),
    );
  };
  const addQuarter = (quarter: string) =>
    perform(JSON.stringify({ quarter }), (key) =>
      repository.addQuarter(quarter, key),
    );
  const candidates = data?.candidates ?? [];
  const ready = candidates.filter(
    (item) =>
      item.researchStatus === "ready" && item.reviewStatus === "unreviewed",
  ).length;
  const approved = candidates.filter(
    (item) => item.reviewStatus === "approved",
  ).length;
  const errors = candidates.filter(
    (item) => item.researchStatus === "error",
  ).length;
  const inResearch = candidates.filter((item) =>
    ["queued", "running"].includes(item.researchStatus),
  ).length;
  const filtered = candidates
    .filter((item) => {
      if (
        tab === "messages" &&
        item.reviewStatus !== "approved" &&
        !item.sent.length
      )
        return false;
      if (tab === "review") {
        if (
          filter === "ready" &&
          !(
            item.researchStatus === "ready" &&
            item.reviewStatus === "unreviewed"
          )
        )
          return false;
        if (
          filter === "mine" &&
          !(
            item.owner?.id === currentActor.id &&
            item.reviewStatus === "reviewing"
          )
        )
          return false;
        if (filter === "approved" && item.reviewStatus !== "approved")
          return false;
        if (filter === "rejected" && !item.reviewStatus.startsWith("rejected"))
          return false;
      }
      const q = (params.get("q") ?? "").toLocaleLowerCase();
      if (q && !`${item.name} ${item.summary}`.toLocaleLowerCase().includes(q))
        return false;
      if (params.get("owner") === "mine" && item.owner?.id !== currentActor.id)
        return false;
      if (params.get("owner") === "unassigned" && item.owner) return false;
      if (
        params.get("from") &&
        item.discoveredAt.slice(0, 10) < params.get("from")!
      )
        return false;
      if (
        params.get("to") &&
        item.discoveredAt.slice(0, 10) > params.get("to")!
      )
        return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.discoveredAt.localeCompare(b.discoveredAt) ||
        a.name.localeCompare(b.name),
    );
  const maxPage = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, maxPage);
  const rows = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const focused =
    selected ?? (params.get("candidate") === "none" ? undefined : rows[0]);
  const openMessage = (id: string) =>
    navigate({ message: id, candidate: null, view: "messages" });
  if (tab === "review" && !message) {
    if (loading) return <UnifiedReviewLoading />;
    if (!data) return <main className="uw-load-error" role="alert"><p>{error}</p><button onClick={() => void load()}>다시 불러오기</button></main>;
    return <UnifiedReviewPanel candidates={candidates} selectedId={params.get("candidate")}
      pending={pending} error={error} change={change} onDirty={trackDirty}
      preview={repository.mode === "preview"}
      onSelect={(id) => navigate({ candidate: id })}
      onMessage={openMessage} />;
  }
  return (
    <div className="rv-app">
      <header className="rv-header">
        <div className="rv-brand">
          <span>GH</span>
          <div>
            Growth Hackers<small>대외협력 워크스페이스</small>
          </div>
        </div>
        <div className="rv-account">
          <span className="rv-avatar">A</span>
          {currentActor.name}
        </div>
      </header>
      {repository.mode === "preview" && (
        <div className="rv-preview">
          <strong>개발 미리보기</strong>
          <span>시연 기업 · 이 브라우저에만 저장 · 실제 조사와 전송 없음</span>
        </div>
      )}
      {!message && (
        <nav className="rv-nav" aria-label="대협 업무">
          <button
            className={tab === "review" ? "active" : ""}
            onClick={() =>
              navigate({ view: "review", candidate: null, page: null })
            }
          >
            기업 검토 <b>{ready}</b>
          </button>
          <button
            className={tab === "messages" ? "active" : ""}
            onClick={() =>
              navigate({ view: "messages", candidate: null, page: null })
            }
          >
            메시지 <b>{approved}</b>
          </button>
          <button
            className={tab === "collection" ? "active" : ""}
            onClick={() =>
              navigate({ view: "collection", candidate: null, page: null })
            }
          >
            수집·조사 현황
          </button>
        </nav>
      )}
      {loading ? (
        <main className="rv-content" role="status">
          작업 공간을 불러오는 중…
        </main>
      ) : !data ? (
        <main className="rv-content">
          <p role="alert">{error}</p>
          <button onClick={() => void load()}>다시 불러오기</button>
        </main>
      ) : message ? (
        <MessagePage
          key={message.id}
          candidate={message}
          quarters={data.quarters}
          change={change}
          addQuarter={addQuarter}
          pending={pending}
          error={error}
          back={() => navigate({ message: null })}
        />
      ) : (
        <main className="rv-content">
          <div className="rv-title">
            <div>
              <h1>
                {tab === "collection"
                  ? "수집·조사 현황"
                  : tab === "messages"
                    ? "메시지"
                    : "기업 검토"}
              </h1>
            </div>
            <button disabled={pending} onClick={() => void load()}>
              ↻ 새로고침
            </button>
          </div>
          {error && !selected && !(tab === "review" && focused) && (
            <p role="alert" className="rv-error">
              {error}
            </p>
          )}
          <div className="rv-health">
            <span className="rv-health-label">수집 상태</span>
            <button onClick={() => navigate({ view: "collection" })}>
              조사 대기·진행 <b>{inResearch}</b>
            </button>
            <button
              className={errors ? "has-error" : ""}
              onClick={() => navigate({ view: "collection" })}
            >
              조사 오류 <b>{errors}</b>
            </button>
            <span className="rv-health-source">웹 아카이브에서 자동 수집</span>
          </div>
          {tab === "collection" ? (
            <>
              <section className="rv-card">
                <div className="rv-section-title">
                  <h2>수집 실행 내역</h2>
                  <span>웹 아카이브</span>
                </div>
                {data.runs.map((run) => (
                  <details className="rv-run" key={run.id}>
                    <summary>
                      <strong>
                        {new Date(run.at).toLocaleDateString("ko-KR")} 수집
                      </strong>
                      <span>
                        {run.source} · 원문 {run.items.length}개 · 추출{" "}
                        {run.items.reduce((n, i) => n + i.names.length, 0)}개 ·
                        중복 {run.items.reduce((n, i) => n + i.duplicates, 0)}개
                      </span>
                      <span className="rv-badge approved">
                        {run.status === "completed" ? "완료" : "일부 오류"}
                      </span>
                    </summary>
                    {run.items.map((item) => (
                      <article key={item.id}>
                        <SourceLink url={item.url}>{item.title}</SourceLink>
                        <p>{item.names.join(" · ")}</p>
                        {item.error && <p className="rv-error">{item.error}</p>}
                      </article>
                    ))}
                  </details>
                ))}
              </section>
              <section className="rv-card">
                <h2>기업별 조사</h2>
                <p className="rv-muted">
                  오류는 검토 결과에 영향을 주지 않습니다. 재시도 후에는 조사
                  대기로 돌아갑니다.
                </p>
                <div className="rv-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>기업</th>
                        <th>조사 상태</th>
                        <th>설명</th>
                        <th>작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>
                            <span className={`rv-badge ${c.researchStatus}`}>
                              {researchLabels[c.researchStatus]}
                            </span>
                          </td>
                          <td>
                            {c.error?.message ??
                              (c.researchStatus === "ready"
                                ? "판단 자료가 준비되었습니다."
                                : "조사 작업을 기다리고 있습니다.")}
                          </td>
                          <td>
                            {c.error?.retryable ? (
                              <button
                                disabled={pending}
                                onClick={() =>
                                  void change(c, { type: "retry" })
                                }
                              >
                                재시도
                              </button>
                            ) : (
                              <button
                                onClick={() => navigate({ candidate: c.id })}
                              >
                                자료 보기
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="rv-list">
              {tab === "review" && (
                <div className="rv-filters">
                  {[
                    ["ready", "검토할 기업"],
                    ["mine", "내가 검토 중"],
                    ["approved", "승인"],
                    ["rejected", "거절"],
                    ["all", "전체"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      onClick={() => navigate({ filter: value, page: null })}
                    >
                      {label}{" "}
                      <span className="rv-tab-count">
                        {value === "ready"
                          ? ready
                          : value === "approved"
                            ? approved
                            : value === "mine"
                              ? candidates.filter(
                                  (c) =>
                                    c.owner?.id === currentActor.id &&
                                    c.reviewStatus === "reviewing",
                                ).length
                              : value === "rejected"
                                ? candidates.filter((c) =>
                                    c.reviewStatus.startsWith("rejected"),
                                  ).length
                                : candidates.length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="rv-toolbar">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    navigate({ q: query || null, page: null });
                  }}
                >
                  <input
                    aria-label="기업 검색"
                    placeholder="기업명 또는 설명 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button>검색</button>
                </form>
                <select
                  aria-label="담당자 필터"
                  value={params.get("owner") ?? ""}
                  onChange={(e) =>
                    navigate({ owner: e.target.value || null, page: null })
                  }
                >
                  <option value="">모든 담당자</option>
                  <option value="mine">내 기업</option>
                  <option value="unassigned">미배정</option>
                </select>
                <label>
                  수집일
                  <input
                    aria-label="수집 시작일"
                    type="date"
                    value={params.get("from") ?? ""}
                    onChange={(e) =>
                      navigate({ from: e.target.value || null, page: null })
                    }
                  />
                </label>
                <label>
                  ~
                  <input
                    aria-label="수집 종료일"
                    type="date"
                    value={params.get("to") ?? ""}
                    onChange={(e) =>
                      navigate({ to: e.target.value || null, page: null })
                    }
                  />
                </label>
              </div>
              <div className="rv-list-summary">
                <span>
                  총 <b>{filtered.length}</b>개 기업
                </span>
                <small>수집일 오래된 순</small>
              </div>
              {tab === "review" ? (
                <div
                  className={`rv-review-split ${focused ? "has-focus" : ""}`}
                >
                  <aside
                    className="rv-review-queue"
                    aria-label="검토할 기업 목록"
                  >
                    <div className="rv-queue-heading">
                      기업 <span>{filtered.length}</span>
                    </div>
                    {rows.map((c) => (
                      <button
                        key={c.id}
                        aria-pressed={focused?.id === c.id}
                        onClick={() => navigate({ candidate: c.id })}
                      >
                        <span className="rv-queue-name">
                          {c.name}
                          <span className={`rv-badge ${c.reviewStatus}`}>
                            {reviewLabels[c.reviewStatus]}
                          </span>
                        </span>
                        <span className="rv-queue-description">
                          {c.summary}
                        </span>
                        <small>
                          {c.owner?.name ?? "미배정"} ·{" "}
                          {researchLabels[c.researchStatus]}
                        </small>
                      </button>
                    ))}
                    {!rows.length && (
                      <p className="rv-help">이 조건의 기업이 없습니다.</p>
                    )}
                  </aside>
                  {focused ? (
                    <CandidateReview
                      key={focused.id}
                      inline
                      candidate={focused}
                      pending={pending}
                      error={error}
                      change={change}
                      onDirty={trackDirty}
                      close={() => navigate({ candidate: "none" })}
                      message={() => openMessage(focused.id)}
                      next={() => {
                        const i = filtered.findIndex(
                          (c) => c.id === focused.id,
                        );
                        const target =
                          filtered[i + 1] ??
                          filtered.find((c) => c.id !== focused.id);
                        if (target)
                          navigate({
                            candidate: target.id,
                            page: String(
                              Math.floor(filtered.indexOf(target) / 10) + 1,
                            ),
                          });
                        else navigate({ candidate: "none" });
                      }}
                    />
                  ) : (
                    <div className="rv-focus-empty">
                      <h2>검토할 기업을 선택하세요</h2>
                      <p>조사 자료와 연락할 관계자를 확인합니다.</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="rv-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>기업</th>
                          <th>{tab === "messages" ? "목표 분기" : "조사"}</th>
                          <th>{tab === "messages" ? "메시지" : "검토"}</th>
                          <th>담당자</th>
                          <th>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((c) => (
                          <tr
                            key={c.id}
                            className={
                              selected?.id === c.id ? "rv-selected-row" : ""
                            }
                          >
                            <td>
                              <button
                                className="rv-company-name"
                                onClick={() => navigate({ candidate: c.id })}
                              >
                                {c.name}
                              </button>
                              <p>{c.summary}</p>
                              <small>
                                {new Date(c.discoveredAt).toLocaleDateString(
                                  "ko-KR",
                                )}{" "}
                                발견
                              </small>
                            </td>
                            <td>
                              {tab === "messages" ? (
                                (c.quarter ?? "미선택")
                              ) : (
                                <span
                                  className={`rv-badge ${c.researchStatus}`}
                                >
                                  {researchLabels[c.researchStatus]}
                                </span>
                              )}
                            </td>
                            <td>
                              {tab === "messages" ? (
                                c.sent.some(
                                  (s) => s.draft.revision === c.draft?.revision,
                                ) ? (
                                  "발송 완료"
                                ) : c.draft ? (
                                  "초안 있음"
                                ) : (
                                  "미생성"
                                )
                              ) : (
                                <span className={`rv-badge ${c.reviewStatus}`}>
                                  {reviewLabels[c.reviewStatus]}
                                </span>
                              )}
                            </td>
                            <td>
                              {c.owner?.name ?? (
                                <span className="rv-muted">미배정</span>
                              )}
                            </td>
                            <td>
                              <button
                                onClick={() =>
                                  tab === "messages"
                                    ? openMessage(c.id)
                                    : navigate({ candidate: c.id })
                                }
                              >
                                {tab === "messages"
                                  ? "메시지 열기 →"
                                  : "검토 열기 →"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {!rows.length && (
                <div className="rv-empty">
                  <h3>
                    {tab === "messages"
                      ? "승인한 기업의 메시지를 여기서 준비합니다."
                      : "이 조건의 기업이 없습니다."}
                  </h3>
                  <p>필터를 바꾸거나 수집·조사 현황을 확인해주세요.</p>
                </div>
              )}
              <div className="rv-pagination">
                <span>
                  {currentPage} / {maxPage} 페이지
                </span>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => navigate({ page: String(currentPage - 1) })}
                >
                  이전
                </button>
                <button
                  disabled={currentPage >= maxPage}
                  onClick={() => navigate({ page: String(currentPage + 1) })}
                >
                  다음
                </button>
              </div>
            </section>
          )}
          <p className="rv-bottom-note">
            {data.runs[0]
              ? `최근 수집 ${new Date(data.runs[0].at).toLocaleString("ko-KR")} · 웹 아카이브`
              : "수집 기록 없음"}
          </p>
        </main>
      )}
      {selected && !message && tab !== "review" && (
        <CandidateReview
          key={selected.id}
          candidate={selected}
          pending={pending}
          error={error}
          change={change}
          close={() => navigate({ candidate: null })}
          message={() => openMessage(selected.id)}
          next={() => {
            const others = candidates.filter(
              (item) =>
                item.researchStatus === "ready" &&
                item.reviewStatus === "unreviewed" &&
                item.id !== selected.id,
            );
            navigate({ candidate: others[0]?.id ?? null });
          }}
        />
      )}
    </div>
  );
}
