import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ListupApiError, newOperationKey, type ListupApi } from "./api/client";
import type {
  CandidateContact,
  CandidateDetail,
  CandidateRow,
  OutreachContact,
  OutreachDetail,
  OutreachRow,
  Page,
  SearchInput,
} from "./api/contracts";

const fitLabels: Record<string, string> = {
  fit: "적합",
  pending: "판단 보류",
  unfit: "부적합",
  not_assessed: "조사 중",
};
const stages: Record<string, string> = {
  recipient_selection: "수신자 선택",
  draft_review: "초안 검토",
  ready_to_send: "발송 준비",
  response_check: "발송 후 확인",
  company_review: "기업 검토",
};
const safeLink = (url: string | null | undefined) =>
  url && /^https?:\/\//i.test(url) ? url : undefined;
function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return (
    <div className="lu-live-error" role="alert">
      <p>
        {error instanceof Error ? error.message : "요청을 처리하지 못했습니다."}
      </p>
      {error instanceof ListupApiError && (
        <small>
          {error.code}
          {error.requestId ? ` · 요청 ${error.requestId}` : ""}
        </small>
      )}
      {retry && <button onClick={retry}>다시 조회</button>}
    </div>
  );
}
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setLoading(true);
    setError(undefined);
    setData(undefined);
    void load(control.signal)
      .then((value) => {
        if (!control.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!control.signal.aborted) setError(error);
      })
      .finally(() => {
        if (!control.signal.aborted) setLoading(false);
      });
    return () => control.abort();
  }, [load, revision]);
  return {
    data,
    error,
    loading,
    reload: () => setRevision((value) => value + 1),
  };
}
async function allPages<T>(load: (cursor?: string) => Promise<Page<T>>) {
  const items: T[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await load(cursor);
    items.push(...page.items);
    if (!page.hasMore) return items;
    if (!page.nextCursor || visited.has(page.nextCursor))
      throw new Error("목록의 다음 페이지를 확인하지 못했습니다.");
    visited.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (true);
}
// Keeps an ambiguous network retry tied to the exact original request.
export function useServerMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const busy = useRef(false);
  const operation = useRef<{ signature: string; key: string }>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run<T>(
    signature: string,
    action: (key: string) => Promise<T>,
  ): Promise<T | undefined> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    if (operation.current?.signature !== signature)
      operation.current = { signature, key: newOperationKey() };
    try {
      const result = await action(operation.current.key);
      operation.current = undefined;
      return alive.current ? result : undefined;
    } catch (error) {
      if (
        !(
          error instanceof ListupApiError &&
          (error.code === "NETWORK_ERROR" ||
            error.code === "INVALID_RESPONSE" ||
            error.status >= 500)
        )
      )
        operation.current = undefined;
      if (alive.current) setError(error);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return { run, pending, error, clear: () => setError(undefined) };
}
function Drawer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className="lu-live-drawer" onCancel={onClose}>
      <div className="lu-ws-detail-head">
        <button onClick={onClose} aria-label="상세 닫기">
          닫기 ×
        </button>
      </div>
      <div className="lu-ws-detail-scroll">{children}</div>
    </dialog>
  );
}
export function LiveWorkspace({
  api,
  email,
  onSignOut,
}: {
  api: ListupApi;
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const readId = () => {
    const match = /^#outreach=(.+)$/.exec(location.hash);
    try {
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  };
  const [outreachId, setOutreachId] = useState(readId);
  const [tab, setTab] = useState<"candidates" | "outreaches">("candidates");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchRunId, setSearchRunId] = useState<string>();
  const [accountError, setAccountError] = useState<unknown>();
  useEffect(() => {
    const sync = () => setOutreachId(readId());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const load = useCallback(
    (signal: AbortSignal): Promise<Page<CandidateRow | OutreachRow>> =>
      tab === "candidates"
        ? api.listCandidates(
            { q: search, searchRunId, cursor, limit: 20 },
            { signal },
          )
        : api.listOutreaches({ query: search, cursor, limit: 20 }, { signal }),
    [api, tab, search, cursor, searchRunId],
  );
  const list = useLoad(load);
  function openOutreach(id: string) {
    setSelected(null);
    location.hash = `outreach=${encodeURIComponent(id)}`;
  }
  function changeTab(next: typeof tab) {
    setTab(next);
    setHistory([]);
    setCursor(undefined);
  }
  return (
    <div className="lu-shell">
      <aside className="lu-sidebar">
        <div className="lu-brand">
          <span>G</span>대협 어드민
        </div>
        <div className="lu-side-label">신규 수주</div>
        <p>실제 데이터</p>
      </aside>
      <div className="lu-workspace">
        <header className="lu-topbar">
          <strong>대협 어드민</strong>
          <span>{email}</span>
          <button onClick={() => void onSignOut().catch(setAccountError)}>
            로그아웃
          </button>
        </header>
        <ErrorNotice error={accountError} />
        {outreachId ? (
          <LiveMessage
            key={outreachId}
            api={api}
            id={outreachId}
            onBack={() => {
              location.hash = "";
              changeTab("outreaches");
              list.reload();
            }}
          />
        ) : (
          <main className="lu-main lu-ws-main">
            <div className="lu-page-title">
              <h1>수주 후보</h1>
              <p>조사 결과를 확인하고 수신자와 메시지를 준비하세요.</p>
            </div>
            <div className="lu-live-toolbar">
              <button
                className="lu-primary"
                onClick={() => setShowSearch(true)}
              >
                ＋ 새 탐색
              </button>
              <button
                aria-pressed={tab === "candidates"}
                onClick={() => changeTab("candidates")}
              >
                조사 결과
              </button>
              <button
                aria-pressed={tab === "outreaches"}
                onClick={() => changeTab("outreaches")}
              >
                컨택 업무
              </button>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearch(query.trim());
                  setCursor(undefined);
                  setHistory([]);
                }}
              >
                <input
                  aria-label="기업 검색"
                  placeholder="기업 검색"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button>검색</button>
              </form>
              <button onClick={list.reload}>새로고침</button>
            </div>
            <ErrorNotice error={list.error} retry={list.reload} />
            {tab === "candidates" && searchRunId && (
              <p>
                선택한 탐색의 조사 결과{" "}
                <button
                  onClick={() => {
                    setSearchRunId(undefined);
                    setCursor(undefined);
                    setHistory([]);
                  }}
                >
                  전체 결과 보기
                </button>
              </p>
            )}
            {list.loading && <p role="status">목록을 불러오는 중…</p>}
            {list.data && (
              <>
                <div className="lu-surface lu-table-scroll">
                  <table className="lu-table lu-ws-table">
                    <thead>
                      <tr>
                        <th>기업</th>
                        <th>진행</th>
                        <th>{tab === "candidates" ? "연락처" : "담당자"}</th>
                        <th>업무</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.items.map((item) =>
                        "fit" in item ? (
                          <tr key={item.id}>
                            <td>
                              <button
                                className="lu-text-button"
                                onClick={() => setSelected(item.id)}
                              >
                                {item.company.name}
                              </button>
                            </td>
                            <td>{fitLabels[item.fit.effectiveVerdict]}</td>
                            <td>사용 가능 {item.contacts.usableCount}개</td>
                            <td>
                              <button onClick={() => setSelected(item.id)}>
                                조사 결과 열기
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={item.outreachId}>
                            <td>{item.name}</td>
                            <td>{stages[item.workStage] ?? item.workStage}</td>
                            <td>{item.owner.displayName}</td>
                            <td>
                              <button
                                onClick={() => openOutreach(item.outreachId)}
                              >
                                메시지 열기
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                  {!list.data.items.length && (
                    <p className="lu-empty">조건에 맞는 결과가 없습니다.</p>
                  )}
                </div>
                <div className="lu-live-toolbar">
                  <button
                    disabled={!history.length}
                    onClick={() => {
                      setCursor(history.at(-1));
                      setHistory(history.slice(0, -1));
                    }}
                  >
                    이전
                  </button>
                  <span>{history.length + 1} 페이지</span>
                  <button
                    disabled={!list.data.hasMore || !list.data.nextCursor}
                    onClick={() => {
                      setHistory([...history, cursor]);
                      setCursor(list.data!.nextCursor!);
                    }}
                  >
                    다음
                  </button>
                </div>
              </>
            )}
            {selected && (
              <Drawer onClose={() => setSelected(null)}>
                <CandidatePanel
                  key={selected}
                  api={api}
                  id={selected}
                  onOpen={openOutreach}
                />
              </Drawer>
            )}
            {showSearch && (
              <Drawer onClose={() => setShowSearch(false)}>
                <SearchPanel
                  api={api}
                  onResults={(id) => {
                    setShowSearch(false);
                    setSearchRunId(id);
                    setQuery("");
                    setSearch("");
                    changeTab("candidates");
                    list.reload();
                  }}
                />
              </Drawer>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
function QuarterCreator({
  api,
  onCreated,
}: {
  api: ListupApi;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(1);
  const mutation = useServerMutation();
  return (
    <div className="lu-live-quarter-create">
      <button
        type="button"
        disabled={mutation.pending}
        onClick={() => setOpen(!open)}
      >
        {open ? "분기 추가 닫기" : "＋ 분기 추가"}
      </button>
      {open && (
        <div>
          <fieldset disabled={mutation.pending}>
            <legend>목표 분기 추가</legend>
            <label>
              연도
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(event) => setYear(event.target.valueAsNumber)}
              />
            </label>
            <label>
              분기
              <select
                value={quarter}
                onChange={(event) => setQuarter(Number(event.target.value))}
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}분기
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!Number.isInteger(year) || year < 2000 || year > 2100}
              onClick={() => {
                void mutation
                  .run(
                    JSON.stringify({ year, quarter }),
                    async (idempotencyKey) => {
                      try {
                        return await api.createTargetQuarter(
                          { year, quarter },
                          { idempotencyKey },
                        );
                      } catch (error) {
                        if (
                          !(error instanceof ListupApiError) ||
                          error.code !== "ALREADY_EXISTS"
                        )
                          throw error;
                        const quarters = await allPages((cursor) =>
                          api.listTargetQuarters({ cursor, limit: 100 }),
                        );
                        const existing = quarters.find(
                          (item) =>
                            item.year === year && item.quarter === quarter,
                        );
                        if (!existing) throw error;
                        return existing;
                      }
                    },
                  )
                  .then((result) => {
                    if (result) {
                      onCreated(result.id);
                      setOpen(false);
                    }
                  });
              }}
            >
              {mutation.pending ? "저장 중…" : "추가하고 선택"}
            </button>
          </fieldset>
          <p>이미 등록된 분기는 기존 분기를 선택합니다.</p>
          <ErrorNotice error={mutation.error} />
        </div>
      )}
    </div>
  );
}

function SearchPanel({
  api,
  onResults,
}: {
  api: ListupApi;
  onResults: (id: string) => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [options, quarters] = await Promise.all([
        api.getSearchOptions({ signal }),
        allPages((cursor) =>
          api.listTargetQuarters({ cursor, limit: 100 }, { signal }),
        ),
      ]);
      return { options, quarters };
    },
    [api],
  );
  const config = useLoad(load);
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const loadRuns = useCallback(
    (signal: AbortSignal) =>
      api.listSearchRuns({ cursor, limit: 10 }, { signal }),
    [api, cursor],
  );
  const runs = useLoad(loadRuns);
  const mutation = useServerMutation();
  const [quarter, setQuarter] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [conditions, setConditions] = useState("");
  const [maximum, setMaximum] = useState(10);
  const [receipt, setReceipt] = useState<string>();
  const status: Record<string, string> = {
    queued: "접수 · 대기 중",
    running: "조사 중",
    completed: "완료",
    partially_completed: "일부 완료",
    failed: "실패",
    cancelled: "취소됨",
  };
  return (
    <section className="lu-live-search">
      <h2>새 탐색</h2>
      <p>
        프로젝트를 진행할 목표 분기와 기업을 찾을 소스를 선택하세요. 탐색을
        시작한 사람이 담당자가 됩니다.
      </p>
      <ErrorNotice error={config.error} retry={config.reload} />
      {config.loading && <p role="status">탐색 설정을 불러오는 중…</p>}
      {config.data && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.pending || !quarter || !sources.length) return;
            const input: SearchInput = {
              targetQuarterId: quarter,
              sources: sources.map((key) => ({
                key,
                name: key,
                entryUrls: [],
                query: conditions.trim() || null,
              })),
              filters: {
                industries: [],
                keywords: [],
                regions: [],
                companyStages: [],
                excludedCompanyIds: [],
                additionalConditions: conditions.trim() || null,
              },
              maxCompanies: maximum,
            };
            void mutation
              .run(JSON.stringify(input), (idempotencyKey) =>
                api.createSearchRun(input, { idempotencyKey }),
              )
              .then((result) => {
                if (!result) return;
                setReceipt(result.searchRun.id);
                setCursor(undefined);
                setHistory([]);
                runs.reload();
              });
          }}
        >
          <fieldset disabled={mutation.pending || !!receipt}>
            <label>
              목표 분기
              <select
                required
                value={quarter}
                onChange={(event) => setQuarter(event.target.value)}
              >
                <option value="">분기 선택</option>
                {config.data.quarters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.year}년 {item.quarter}분기
                  </option>
                ))}
              </select>
            </label>
            {!config.data.quarters.length && (
              <p>등록된 목표 분기가 없습니다. 분기를 먼저 등록해야 합니다.</p>
            )}
            <QuarterCreator
              api={api}
              onCreated={(id) => {
                setQuarter(id);
                config.reload();
              }}
            />
            <fieldset>
              <legend>발견 소스</legend>
              {config.data.options.sources.map((source) => {
                const availability =
                  config.data!.options.sourceAvailability[source];
                return (
                  <label className="lu-live-source" key={source}>
                    <input
                      type="checkbox"
                      checked={sources.includes(source)}
                      disabled={!availability?.available}
                      onChange={(event) =>
                        setSources(
                          event.target.checked
                            ? [...sources, source]
                            : sources.filter((item) => item !== source),
                        )
                      }
                    />
                    <span>
                      {source}
                      {availability?.reason && (
                        <small>{availability.reason}</small>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <label>
              탐색 조건 <span>(선택)</span>
              <textarea
                rows={3}
                value={conditions}
                placeholder="예: 국내 B2B SaaS 기업, 고객 행동 데이터 활용 가능성"
                onChange={(event) => setConditions(event.target.value)}
              />
            </label>
            <label>
              최대 조사 기업 수
              <input
                required
                type="number"
                min={1}
                max={30}
                value={maximum}
                onChange={(event) => setMaximum(event.target.valueAsNumber)}
              />
            </label>
            <small>
              현재 서버가 허용하는 범위는 1~30개입니다. 실제 발견 수는 더 적을
              수 있습니다.
            </small>
            <button
              className="lu-primary"
              disabled={
                !quarter ||
                !sources.length ||
                !Number.isInteger(maximum) ||
                maximum < 1 ||
                maximum > 30
              }
              type="submit"
            >
              {mutation.pending ? "접수 중…" : "탐색 시작"}
            </button>
          </fieldset>
        </form>
      )}
      <ErrorNotice error={mutation.error} />
      {receipt && (
        <div role="status">
          <strong>탐색 요청이 접수되었습니다.</strong>
          <p>조사 완료는 아래 상태에서 확인하세요.</p>
          <button onClick={() => onResults(receipt)}>
            이 탐색의 결과 보기
          </button>
          <button onClick={() => setReceipt(undefined)}>다른 탐색 설정</button>
        </div>
      )}
      <p className="lu-live-search-note">
        접수 후 작업 실행기가 기업·연락처 조사를 진행합니다. 대기가 계속되면
        서버의 AI 키와 작업 실행기 연결을 확인해야 합니다.
      </p>
      <div className="lu-live-toolbar">
        <h3>탐색 내역</h3>
        <button onClick={runs.reload}>상태 새로고침</button>
      </div>
      <ErrorNotice error={runs.error} retry={runs.reload} />
      {runs.loading && <p role="status">탐색 내역을 불러오는 중…</p>}
      {runs.data && (
        <>
          <ul className="lu-live-runs">
            {runs.data.items.map((run) => (
              <li key={run.id}>
                <div>
                  <strong>
                    {run.targetQuarter.year}년 {run.targetQuarter.quarter}분기
                  </strong>
                  <span>{status[run.status] ?? run.status}</span>
                </div>
                <p>
                  {run.sources.map((source) => source.name).join(" · ")} ·{" "}
                  {new Date(run.createdAt).toLocaleString("ko-KR")}
                </p>
                {run.finishReason && <p>{run.finishReason}</p>}
                <button onClick={() => onResults(run.id)}>
                  조사 결과 보기
                </button>
              </li>
            ))}
          </ul>
          {!runs.data.items.length && <p>아직 접수된 탐색이 없습니다.</p>}
          <div className="lu-live-toolbar">
            <button
              disabled={!history.length}
              onClick={() => {
                setCursor(history.at(-1));
                setHistory(history.slice(0, -1));
              }}
            >
              이전
            </button>
            <button
              disabled={!runs.data.hasMore || !runs.data.nextCursor}
              onClick={() => {
                setHistory([...history, cursor]);
                setCursor(runs.data!.nextCursor!);
              }}
            >
              다음
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CandidatePanel({
  api,
  id,
  onOpen,
}: {
  api: ListupApi;
  id: string;
  onOpen: (id: string) => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [detail, contacts] = await Promise.all([
        api.getCandidate(id, { signal }),
        allPages((cursor) =>
          api.listCandidateContacts(id, { cursor, limit: 100 }, { signal }),
        ),
      ]);
      return { detail, contacts };
    },
    [api, id],
  );
  const resource = useLoad(load);
  const mutation = useServerMutation();
  if (resource.loading) return <p role="status">조사 결과를 불러오는 중…</p>;
  if (!resource.data)
    return <ErrorNotice error={resource.error} retry={resource.reload} />;
  const { detail, contacts } = resource.data;
  const canStart =
    detail.candidate.effectiveFit === "fit" && detail.contactCounts.usable > 0;
  return (
    <>
      <h2>{detail.company.name}</h2>
      <span className="lu-panel-status">
        {fitLabels[detail.candidate.effectiveFit]}
      </span>
      <section className="lu-ws-detail-section">
        <h3>사업·협업 접점</h3>
        {detail.currentResearch?.claims.map((claim) => (
          <p key={claim.id}>{claim.content}</p>
        ))}
        {!detail.currentResearch && <p>조사 보고서가 아직 없습니다.</p>}
        <h3>적합성 판단</h3>
        <p>
          {detail.activeHumanDecision?.reason ??
            detail.latestSystemAssessment?.summary ??
            "판단 근거 없음"}
        </p>
        {detail.latestSystemAssessment?.interventions.map((item) => (
          <p key={item.id}>
            <strong>{item.area}</strong>
            <br />
            {item.possibility.reason}
            <br />
            {item.value.reason}
          </p>
        ))}
        {detail.currentResearch?.missingInformation.length ? (
          <p>미확인: {detail.currentResearch.missingInformation.join(", ")}</p>
        ) : null}
      </section>
      <section className="lu-ws-detail-section">
        <h3>연락처</h3>
        {contacts.map((contact) => (
          <article className="lu-ws-person" key={contact.evaluation.id}>
            <strong>{contact.person?.name ?? "공용 연락 창구"}</strong>
            <p>{contact.person?.role}</p>
            <p>
              {contact.endpoint.channel === "linkedin" &&
              safeLink(contact.endpoint.address) ? (
                <a
                  href={contact.endpoint.address}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  LinkedIn 프로필 ↗
                </a>
              ) : (
                contact.endpoint.address
              )}
            </p>
            <small>
              {contact.evaluation.status} · {contact.evaluation.reason}
            </small>
          </article>
        ))}
        {!contacts.length && <p>조사된 연락처가 없습니다.</p>}
      </section>
      <ErrorNotice
        error={mutation.error}
        retry={() => {
          mutation.clear();
          resource.reload();
        }}
      />
      <button
        className="lu-primary"
        disabled={
          !canStart ||
          mutation.pending ||
          (!!mutation.error &&
            mutation.error instanceof ListupApiError &&
            mutation.error.requiresReload)
        }
        onClick={async () => {
          const next = await mutation.run(
            `start:${id}:${detail.candidate.revision}`,
            (key) =>
              api.startOutreach(id, detail.candidate.revision, {
                idempotencyKey: key,
              }),
          );
          if (next) onOpen(next.id);
        }}
      >
        {mutation.pending ? "시작 중…" : "컨택 시작"}
      </button>
      {!canStart && <p>적합 판정과 사용 가능한 연락처가 필요합니다.</p>}
      <p className="lu-ws-meta">
        이미 시작한 컨택은 ‘컨택 업무’ 목록에서 이어갈 수 있습니다.
      </p>
      <details>
        <summary>조사 근거</summary>
        {detail.evidence.map((e) => (
          <p key={e.id}>
            {safeLink(e.url) ? (
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                {e.title || e.url}
              </a>
            ) : (
              e.title
            )}
            <br />
            {e.excerpt}
          </p>
        ))}
      </details>
    </>
  );
}
function LiveMessage({
  api,
  id,
  onBack,
}: {
  api: ListupApi;
  id: string;
  onBack: () => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [outreach, contacts] = await Promise.all([
        api.getOutreach(id, { signal }),
        api.listOutreachContacts(id, { signal }),
      ]);
      return { outreach, contacts: contacts.items };
    },
    [api, id],
  );
  const resource = useLoad(load);
  const [current, setCurrent] = useState<OutreachDetail>();
  const [endpoint, setEndpoint] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ topic: "", subject: "", body: "" });
  const [notice, setNotice] = useState("");
  const mutation = useServerMutation();
  useEffect(() => {
    if (resource.data) {
      setCurrent(resource.data.outreach);
      setEndpoint(resource.data.outreach.recipient?.endpointId ?? "");
    }
  }, [resource.data]);
  useEffect(() => {
    if (!editing) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [editing]);
  const conflict =
    mutation.error instanceof ListupApiError && mutation.error.requiresReload;
  const locked = mutation.pending || !!conflict || resource.loading;
  const controls =
    resource.data?.contacts.flatMap((person) =>
      person.endpoints.map((ep) => ({ ...ep, person })),
    ) ?? [];
  const selected = controls.find((item) => item.endpointId === endpoint);
  const confirmed = controls.find(
    (item) => item.endpointId === current?.recipient?.endpointId,
  );
  async function change(
    action: string,
    input: object,
    fn: (key: string) => Promise<OutreachDetail>,
    after?: () => void,
  ) {
    if (locked) return;
    const next = await mutation.run(
      JSON.stringify({ action, id, version: current?.version, input }),
      fn,
    );
    if (next) {
      setCurrent(next);
      setEndpoint(next.recipient?.endpointId ?? "");
      after?.();
      setNotice("저장했습니다.");
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("복사했습니다.");
    } catch {
      setNotice("복사 권한을 확인하거나 본문을 직접 선택해주세요.");
    }
  }
  return (
    <main className="lu-main">
      <section className="lu-message-page">
        <div className="lu-message-page-head">
          <button
            disabled={mutation.pending}
            onClick={() => {
              if (!editing || window.confirm("저장하지 않은 수정을 닫을까요?"))
                onBack();
            }}
          >
            ← 조사 결과로 돌아가기
          </button>
          <h1>{current?.company?.name ?? "컨택"} · 메시지</h1>
          <p>수신자·채널 선택 → 메시지 생성 → 초안 승인</p>
        </div>
        <ErrorNotice error={resource.error} retry={resource.reload} />
        <ErrorNotice error={mutation.error} />
        {conflict && (
          <div className="lu-live-error">
            <p>
              다른 곳에서 변경되었습니다. 입력은 보존되어 있습니다. 최신 내용을
              확인한 뒤 다시 저장해주세요.
            </p>
            <button
              onClick={() => {
                mutation.clear();
                resource.reload();
              }}
            >
              최신 내용 다시 조회
            </button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {resource.loading && <p role="status">불러오는 중…</p>}
        {current && resource.data && !resource.loading && (
          <div className="lu-message-layout">
            <section className="lu-surface lu-message-document">
              <h2>{stages[current.workStage] ?? current.workStage}</h2>
              {editing ? (
                <>
                  <label className="lu-field">
                    프로젝트 주제
                    <input
                      value={form.topic}
                      onChange={(e) =>
                        setForm({ ...form, topic: e.target.value })
                      }
                      disabled={locked}
                    />
                  </label>
                  <label className="lu-field">
                    제목
                    <input
                      value={form.subject}
                      onChange={(e) =>
                        setForm({ ...form, subject: e.target.value })
                      }
                      disabled={locked}
                    />
                  </label>
                  <label className="lu-field">
                    본문
                    <textarea
                      className="lu-ws-message-editor"
                      value={form.body}
                      onChange={(e) =>
                        setForm({ ...form, body: e.target.value })
                      }
                      disabled={locked}
                    />
                  </label>
                  <details>
                    <summary>서버에 저장된 최신 본문 확인</summary>
                    <p className="lu-live-body">{current.draft?.body}</p>
                  </details>
                </>
              ) : current.draft ? (
                <>
                  <strong>{current.draft.subject}</strong>
                  <p className="lu-live-body">{current.draft.body}</p>
                </>
              ) : (
                <p>수신자와 채널을 저장한 뒤 메시지를 생성하세요.</p>
              )}
            </section>
            <div className="lu-message-sidebar">
              <section className="lu-surface lu-message-tools">
                <h2>메시지 준비</h2>
                <div className="lu-live-actions">
                  {editing ? (
                    <>
                      <button
                        disabled={
                          locked ||
                          !form.topic.trim() ||
                          !form.subject.trim() ||
                          !form.body.trim()
                        }
                        onClick={() =>
                          void change(
                            "save",
                            form,
                            (key) =>
                              api.saveDraft(
                                id,
                                {
                                  ...form,
                                  expectedVersion: current.version,
                                  expectedRevision: current.draft!.revision,
                                },
                                { idempotencyKey: key },
                              ),
                            () => setEditing(false),
                          )
                        }
                      >
                        수정 저장
                      </button>
                      <button
                        disabled={locked}
                        onClick={() => setEditing(false)}
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      {current.allowedActions.includes("generateDraft") && (
                        <button
                          className="lu-primary"
                          disabled={
                            locked || endpoint !== current.recipient?.endpointId
                          }
                          onClick={() =>
                            void change("generate", {}, (key) =>
                              api.generateDraft(id, current.version, {
                                idempotencyKey: key,
                              }),
                            )
                          }
                        >
                          {mutation.pending ? "처리 중…" : "메시지 생성"}
                        </button>
                      )}
                      {current.draft &&
                        current.allowedActions.includes("saveDraft") && (
                          <button
                            disabled={locked}
                            onClick={() => {
                              setForm({
                                topic: current.draft!.topic,
                                subject: current.draft!.subject,
                                body: current.draft!.body,
                              });
                              setEditing(true);
                            }}
                          >
                            수정
                          </button>
                        )}
                      {current.draft &&
                        current.allowedActions.includes("approveDraft") && (
                          <button
                            className="lu-primary"
                            disabled={locked}
                            onClick={() =>
                              void change("approve", {}, (key) =>
                                api.approveDraft(
                                  id,
                                  current.version,
                                  current.draft!.revision,
                                  { idempotencyKey: key },
                                ),
                              )
                            }
                          >
                            초안 승인
                          </button>
                        )}
                      {current.allowedActions.includes("changeRecipient") && (
                        <button
                          disabled={locked}
                          onClick={() =>
                            void change("recipient-review", {}, (key) =>
                              api.reviewRecipient(id, current.version, {
                                idempotencyKey: key,
                              }),
                            )
                          }
                        >
                          수신자 변경 · 재생성
                        </button>
                      )}
                      {current.workStage === "recipient_selection" &&
                        current.draft && (
                          <button
                            disabled={locked || !current.recipient}
                            onClick={() =>
                              void change("draft-review", {}, (key) =>
                                api.reviewDraft(id, current.version, {
                                  idempotencyKey: key,
                                }),
                              )
                            }
                          >
                            기존 초안 검토
                          </button>
                        )}
                    </>
                  )}
                </div>
                {Array.isArray(current.blockedReasons) &&
                  current.blockedReasons.map((reason, i) => (
                    <p key={i} className="lu-ws-meta">
                      {String(reason)}
                    </p>
                  ))}
              </section>
              <section className="lu-surface lu-message-recipient">
                <h2>수신자 · 채널</h2>
                <label className="lu-field">
                  연락할 경로
                  <select
                    aria-label="수신자 및 채널"
                    disabled={
                      locked ||
                      editing ||
                      !current.allowedActions.includes("selectRecipient")
                    }
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                  >
                    <option value="">수신자와 채널을 선택하세요</option>
                    {controls.map((item) => (
                      <option
                        key={item.endpointId}
                        value={item.endpointId}
                        disabled={!item.person.selectable || !item.valid}
                      >
                        {item.person.name} ·{" "}
                        {item.channel === "email" ? "이메일" : "LinkedIn"} ·{" "}
                        {item.address}
                        {!item.person.selectable
                          ? ` (${item.person.excludedReason})`
                          : !item.valid
                            ? " (사용 불가)"
                            : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {current.allowedActions.includes("selectRecipient") && (
                  <button
                    disabled={
                      locked ||
                      editing ||
                      !selected ||
                      !selected.valid ||
                      !selected.person.selectable ||
                      endpoint === current.recipient?.endpointId
                    }
                    onClick={() =>
                      void change("recipient", { endpoint }, (key) =>
                        api.selectRecipient(
                          id,
                          {
                            expectedVersion: current.version,
                            contactId: selected!.person.contactId,
                            endpointId: endpoint,
                          },
                          { idempotencyKey: key },
                        ),
                      )
                    }
                  >
                    수신자·채널 저장
                  </button>
                )}
                {confirmed?.channel === "linkedin" &&
                  safeLink(confirmed.address) && (
                    <a
                      className="lu-message-profile-link"
                      href={confirmed.address}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LinkedIn 프로필 열기 ↗
                    </a>
                  )}
                {confirmed?.channel === "email" && <p>{confirmed.address}</p>}
                <div className="lu-message-send-actions">
                  <div className="lu-message-copy-actions">
                    <button
                      disabled={
                        locked ||
                        editing ||
                        current.workStage !== "ready_to_send" ||
                        current.draft?.approvedRevision !==
                          current.draft?.revision ||
                        !current.draft
                      }
                      onClick={() => void copy(current.draft!.subject)}
                    >
                      제목 복사
                    </button>
                    <button
                      disabled={
                        locked ||
                        editing ||
                        current.workStage !== "ready_to_send" ||
                        current.draft?.approvedRevision !==
                          current.draft?.revision ||
                        !current.draft
                      }
                      onClick={() => void copy(current.draft!.body)}
                    >
                      본문 복사
                    </button>
                  </div>
                  <button disabled>전송 완료 저장 (연결 대기)</button>
                </div>
              </section>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
