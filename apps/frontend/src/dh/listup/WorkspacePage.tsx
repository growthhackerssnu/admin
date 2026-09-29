import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Batch,
  Channel,
  Company,
  ContactTask,
  Fit,
  ListupState,
  Person,
  PreviewUser,
} from "./model";
import {
  draftFor,
  contactStage,
  canGenerateDraft,
  fitLabel,
  formatActivityTime,
  hasContactOption,
  quarterOfTimestamp,
  canManageCompany,
  quarterLabel,
  resolvedBody,
} from "./model";

type Update = { id: string; patch: Partial<ContactTask> };

type Props = {
  currentUser: PreviewUser;
  state: ListupState;
  setQuarter: (quarter: string) => void;
  setFit: (id: string, fit: Fit) => void;
  researchContact: (id: string) => void;
  addPerson: (id: string, person: Omit<Person, "id">) => void;
  updateTask: (id: string, patch: Partial<ContactTask>) => void;
  updateTasks: (updates: Update[]) => void;
  moveTask: (id: string, quarter: string) => void;
  startSearch: (
    condition: string | null,
    sources: string[],
    researchLimit: number,
    quarter: string,
  ) => void;
  notify: (message: string) => void;
};

function SearchDialog({
  currentUser,
  currentQuarter,
  availableQuarters,
  onClose,
  onStart,
}: {
  currentUser: PreviewUser;
  currentQuarter: string;
  availableQuarters: string[];
  onClose: () => void;
  onStart: Props["startSearch"];
}) {
  const [quarter, setQuarter] = useState(currentQuarter);
  const [year, setYear] = useState(2027);
  const [part, setPart] = useState(1);
  const [condition, setCondition] = useState("");
  const [sources, setSources] = useState(["Google", "뉴스레터"]);
  const [researchLimit, setResearchLimit] = useState(20);
  const chosenQuarter = quarter === "new" ? `${year}-Q${part}` : quarter;
  function toggleSource(source: string) {
    setSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source],
    );
  }
  return (
    <div
      className="lu-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="lu-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="새 탐색"
      >
        <div className="lu-dialog-head">
          <h2>새 탐색</h2>
          <button
            className="lu-icon-button"
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="lu-muted">
          이번 배치에서 조사할 범위를 정합니다. 분기의 발송 메시지 수와는
          별개예요.
        </p>
        <label className="lu-field">
          목표 수주 분기
          <select
            value={quarter}
            onChange={(event) => setQuarter(event.target.value)}
          >
            {availableQuarters.map((item) => (
              <option value={item} key={item}>
                {quarterLabel(item)}
              </option>
            ))}
            <option value="new">+ 새 분기 추가</option>
          </select>
        </label>
        {quarter === "new" && (
          <div className="lu-ws-new-quarter">
            <label>
              연도
              <input
                type="number"
                min="2026"
                max="2100"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
            <label>
              분기
              <select
                value={part}
                onChange={(event) => setPart(Number(event.target.value))}
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}분기
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="lu-field lu-assignee-field">
          <strong>배치 담당자</strong>
          <span>{currentUser.name}</span>
          <small>로그인 연결 전 시연용 계정입니다.</small>
        </div>
        <label className="lu-field">
          검색어 / 관심 기업 조건{" "}
          <span className="lu-muted">(Google 선택 시 필수)</span>
          <input
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            placeholder="예: 신규 서비스를 출시한 B2C 기업"
          />
        </label>
        <div className="lu-field">
          <strong>검색 소스</strong>
          <div className="lu-source-options">
            {["Google", "뉴스레터", "혁신의 숲"].map((source) => (
              <label key={source}>
                <input
                  type="checkbox"
                  disabled={source === "혁신의 숲"}
                  checked={sources.includes(source)}
                  onChange={() => toggleSource(source)}
                />{" "}
                {source === "혁신의 숲" ? "혁신의 숲 (준비 중)" : source}
              </label>
            ))}
          </div>
        </div>
        <label className="lu-field">
          최대 조사 기업 수
          <input
            type="number"
            min="1"
            max="30"
            value={researchLimit}
            onChange={(event) => setResearchLimit(Number(event.target.value))}
          />
        </label>
        <p className="lu-ws-hint">
          샘플 데이터로만 동작합니다. 기존에 발견한 기업은 분기와 관계없이 다시
          조사하지 않습니다.
        </p>
        <div className="lu-dialog-actions">
          <button onClick={onClose}>취소</button>
          <button
            className="lu-primary"
            disabled={
              !sources.length ||
              researchLimit < 1 ||
              researchLimit > 30 ||
              !Number.isInteger(researchLimit) ||
              (sources.includes("Google") && !condition.trim()) ||
              year < 2026 ||
              year > 2100
            }
            onClick={() => {
              onStart(
                condition.trim() || null,
                sources,
                researchLimit,
                chosenQuarter,
              );
              onClose();
            }}
          >
            탐색 시작
          </button>
        </div>
      </section>
    </div>
  );
}

function CandidateTable({
  tasks,
  companies,
  activeId,
  onOpen,
  onMessage,
  canEdit,
  label,
}: {
  tasks: ContactTask[];
  companies: Company[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onMessage: (task: ContactTask) => void;
  canEdit: (id: string) => boolean;
  label: string;
}) {
  const pageSize = 20;
  const [page, setPage] = useState(0);
  const resultKey = tasks.map((task) => task.companyId).join("|");
  useEffect(() => setPage(0), [resultKey]);
  const lastPage = Math.max(0, Math.ceil(tasks.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageItems = tasks.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const companyOf = (id: string) => companies.find((item) => item.id === id)!;
  return (
    <div className="lu-ws-table-section">
      <div className="lu-table-scroll">
        <table className="lu-table lu-ws-table">
          <colgroup>
            <col className="lu-ws-col-company" />
            <col className="lu-ws-col-area" />
            <col className="lu-ws-col-route" />
            <col className="lu-ws-col-status" />
            <col className="lu-ws-col-message" />
          </colgroup>
          <thead>
            <tr>
              <th>기업 / 서비스</th>
              <th>개입 영역</th>
              <th>조사된 경로</th>
              <th>진행</th>
              <th className="lu-ws-message-cell">메시지</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((task) => {
              const company = companyOf(task.companyId);
              const routes = [
                company.people.some((person) => person.linkedin) && "LinkedIn",
                company.people.some((person) => person.email) && "이메일",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr
                  key={company.id}
                  className={activeId === company.id ? "selected" : ""}
                >
                  <td>
                    <button
                      type="button"
                      className="lu-ws-company-button"
                      onClick={() => onOpen(company.id)}
                    >
                      <strong>{company.name}</strong>
                      <small>{company.service}</small>
                    </button>
                  </td>
                  <td>{company.area}</td>
                  <td>{routes || "—"}</td>
                  <td className={task.sent ? "lu-ws-sent" : ""}>
                    {task.sent
                      ? "전송 완료"
                      : task.noContact
                        ? "이번 탐색에서 연락하지 않음"
                        : contactStage(task) === "ready_to_send"
                          ? "발송 준비 완료"
                          : contactStage(task) === "draft_review"
                            ? "초안 승인 전"
                            : contactStage(task) === "recipient_selection"
                              ? "수신자 · 채널 선택"
                              : hasContactOption(company)
                                ? "컨택 시작 전"
                                : "조사 예외"}
                  </td>
                  <td className="lu-ws-message-cell">
                    <button
                      type="button"
                      title={
                        !contactStage(task) && !hasContactOption(company)
                          ? "적합 판정과 사용 가능한 연락처가 필요합니다."
                          : undefined
                      }
                      disabled={
                        (!task.sent && !!task.noContact) ||
                        (!task.sent &&
                          !contactStage(task) &&
                          (!canEdit(company.id) || !hasContactOption(company)))
                      }
                      aria-label={`${company.name} ${task.sent || contactStage(task) ? "메시지 열기" : "컨택 시작"}`}
                      onClick={() => onMessage(task)}
                    >
                      {task.sent || contactStage(task)
                        ? "메시지 열기"
                        : "컨택 시작"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!tasks.length && (
        <div className="lu-empty">조건에 맞는 후보 기업이 없어요.</div>
      )}
      {tasks.length > pageSize && (
        <nav className="lu-ws-pagination" aria-label={`${label} 페이지 이동`}>
          <span>
            {currentPage * pageSize + 1}–
            {Math.min((currentPage + 1) * pageSize, tasks.length)} /{" "}
            {tasks.length}개
          </span>
          <div>
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              이전
            </button>
            <span>
              {currentPage + 1} / {lastPage + 1}
            </span>
            <button
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              다음
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export function WorkspacePage({
  currentUser,
  state,
  setQuarter,
  setFit,
  researchContact,
  addPerson,
  updateTask,
  updateTasks,
  moveTask,
  startSearch,
  notify,
}: Props) {
  const [view, setView] = useState<"companies" | "batches">("companies");
  const [filter, setFilter] = useState<"all" | "todo" | "sent" | "noContact">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState(
    currentUser.role === "leader" ? "all" : currentUser.id,
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["initial"]));
  const [showExceptions, setShowExceptions] = useState<string | null>(null);
  const initialMessageId = () => {
    const match = /^#message=(.+)$/.exec(window.location.hash);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  };
  const [detailId, setDetailId] = useState<string | null>(initialMessageId);
  const [messagePage, setMessagePage] = useState(() => !!initialMessageId());
  const openedFromList = useRef(false);
  const messageHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const syncPage = () => {
      const id = initialMessageId();
      if (id) setDetailId(id);
      setMessagePage(!!id);
      setEditing(false);
      setMessageExpanded(true);
    };
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);
  useEffect(() => {
    if (messagePage) messageHeadingRef.current?.focus({ preventScroll: true });
  }, [messagePage]);
  function openMessage(id = detailId) {
    if (!id) return;
    setDetailId(id);
    setMessagePage(true);
    setEditing(false);
    openedFromList.current = true;
    setMessageExpanded(true);
    window.location.hash = `message=${encodeURIComponent(id)}`;
  }
  function startContact(task: ContactTask) {
    const company = state.companies.find((item) => item.id === task.companyId);
    if (!company || (!task.sent && task.noContact)) return;
    if (!contactStage(task) && !task.sent) {
      if (!canEdit(task.companyId) || !hasContactOption(company)) return;
      updateTask(task.companyId, { workStage: "recipient_selection" });
    }
    openMessage(task.companyId);
  }
  function backToResults() {
    if (openedFromList.current) window.history.back();
    else window.location.hash = "";
  }
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [messageExpanded, setMessageExpanded] = useState(true);
  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({
    name: "",
    role: "",
    email: "",
    linkedin: "",
  });
  const [manualConfirm, setManualConfirm] = useState(false);
  const [emailReviewIds, setEmailReviewIds] = useState<string[]>([]);
  const [moveQuarter, setMoveQuarter] = useState(state.quarter);
  const detailRef = useRef<HTMLElement>(null);
  const closeDetailRef = useRef<HTMLButtonElement>(null);
  const nestedDialogOpen =
    manualConfirm || emailReviewIds.length > 0 || searchOpen;
  const nestedDialogRef = useRef(nestedDialogOpen);
  nestedDialogRef.current = nestedDialogOpen;
  const batchById = useMemo(
    () => new Map(state.batches.map((batch) => [batch.id, batch])),
    [state.batches],
  );
  const companyById = useMemo(
    () => new Map(state.companies.map((company) => [company.id, company])),
    [state.companies],
  );
  const canEdit = (companyId: string) =>
    canManageCompany(state, currentUser, companyId);
  const canEditActive = detailId !== null && canEdit(detailId);
  const quarterTasks = state.tasks.filter(
    (task) => task.quarter === state.quarter,
  );
  const candidateTasks = quarterTasks.filter((task) => {
    const company = companyById.get(task.companyId);
    return !!company;
  });
  const visible = candidateTasks.filter((task) => {
    const company = companyById.get(task.companyId)!;
    const batch = batchById.get(task.batchId);
    return (
      (!query ||
        `${company.name} ${company.service}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (assignee === "all" || batch?.assignee?.id === assignee) &&
      (filter === "all" ||
        (filter === "sent"
          ? !!task.sent
          : filter === "noContact"
            ? !!task.noContact
            : !task.sent && !task.noContact))
    );
  });
  const batches = state.batches.filter(
    (batch) =>
      batch.quarter === state.quarter ||
      candidateTasks.some((task) => task.batchId === batch.id),
  );
  const activeTask = state.tasks.find((task) => task.companyId === detailId);
  const activeCompany = state.companies.find(
    (company) => company.id === detailId,
  );
  const activeBatch = activeTask
    ? batchById.get(activeTask.batchId)
    : state.batches.find((batch) => batch.companyIds.includes(detailId || ""));
  const activePerson = activeCompany?.people.find(
    (person) => person.id === activeTask?.personId,
  );
  const sentCount = state.tasks.filter(
    (task) => task.sent && quarterOfTimestamp(task.sent.at) === state.quarter,
  ).length;
  const assignedPeople = Array.from(
    new Map(
      batches
        .map((batch) => batch.assignee)
        .filter((person): person is NonNullable<typeof person> => !!person)
        .map((person) => [person.id, person]),
    ).values(),
  );
  const exceptionCount = batches
    .filter((batch) => batch.quarter === state.quarter)
    .reduce(
      (sum, batch) =>
        sum +
        batch.companyIds.filter((id) => {
          const company = companyById.get(id);
          const task = state.tasks.find((item) => item.companyId === id);
          return company && (!hasContactOption(company) || task?.needsResearch);
        }).length,
      0,
    );

  function openDetail(id: string) {
    setDetailId(id);
    const detailScroll = document.querySelector<HTMLElement>(
      ".lu-ws-detail-scroll",
    );
    if (detailScroll) detailScroll.scrollTop = 0;
    setEditing(false);
    setMessageExpanded(false);
    setNewPersonOpen(false);
    setMoveQuarter(
      state.tasks.find((item) => item.companyId === id)?.quarter ??
        state.quarter,
    );
  }
  useEffect(() => {
    if (!detailId || messagePage) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeDetailRef.current?.focus();
    const handleDialogKey = (event: KeyboardEvent) => {
      if (nestedDialogRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setDetailId(null);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        detailRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [detailId, messagePage]);
  useEffect(() => {
    if (!nestedDialogOpen) return;
    const dialog = document.querySelector<HTMLElement>(
      ".lu-overlay .lu-dialog",
    );
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
        ),
      ).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setManualConfirm(false);
        setEmailReviewIds([]);
        setSearchOpen(false);
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [nestedDialogOpen]);
  function changeQuarter(quarter: string) {
    setQuarter(quarter);
    setDetailId(null);
    setQuery("");
    setFilter("all");
    setAssignee(currentUser.role === "leader" ? "all" : currentUser.id);
  }
  function send(ids: string[], channel: Channel) {
    const updates = ids.flatMap((id): Update[] => {
      const task = state.tasks.find((item) => item.companyId === id);
      const company = companyById.get(id);
      const person = company?.people.find((item) => item.id === task?.personId);
      if (
        !task ||
        !canEdit(id) ||
        !company ||
        !person ||
        task.sent ||
        task.noContact ||
        task.needsResearch ||
        !hasContactOption(company) ||
        task.status !== "ready" ||
        contactStage(task) !== "ready_to_send" ||
        task.channel !== channel ||
        !task.subject.trim() ||
        !task.body.trim() ||
        !(channel === "email" ? person.email : person.linkedin)
      )
        return [];
      return [
        {
          id,
          patch: {
            sent: {
              channel,
              recipient: person.name,
              subject: task.subject,
              body: resolvedBody(task, company),
              at: new Date().toISOString(),
            },
          },
        },
      ];
    });
    if (updates.length) updateTasks(updates);
    setEmailReviewIds([]);
    setManualConfirm(false);
    notify(
      channel === "email"
        ? "이메일 수동 전송 기록을 저장했어요."
        : "LinkedIn 수동 전송 기록을 저장했어요.",
    );
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label}을 복사했어요.`);
    } catch {
      notify("복사가 제한되었습니다. 내용을 직접 선택해 복사해주세요.");
    }
  }
  const canSendActive =
    canEditActive &&
    !!activeTask &&
    !!activePerson &&
    activeTask.status === "ready" &&
    contactStage(activeTask) === "ready_to_send" &&
    !activeTask.needsResearch &&
    !activeTask.sent &&
    !activeTask.noContact &&
    !!activeTask.channel &&
    !!activeTask.subject.trim() &&
    !!activeTask.body.trim() &&
    !!(activeTask.channel === "email"
      ? activePerson.email
      : activePerson.linkedin);

  return (
    <main className="lu-main lu-ws-main">
      <div hidden={messagePage}>
        <div className="lu-page-title lu-ws-title">
          <div>
            <h1>수주 후보</h1>
            <p className="lu-muted">
              조사된 기업을 확인하고, 수신자와 전송 방법을 직접 선택하세요.
            </p>
          </div>
          <button className="lu-primary" onClick={() => setSearchOpen(true)}>
            ＋ 새 탐색
          </button>
        </div>
        <div className="lu-ws-quarter-line">
          <label htmlFor="lu-ws-quarter">목표 수주 분기</label>
          <select
            id="lu-ws-quarter"
            value={state.quarter}
            onChange={(event) => changeQuarter(event.target.value)}
          >
            {state.quarters.map((item) => (
              <option key={item} value={item}>
                {quarterLabel(item)}
              </option>
            ))}
          </select>
          <span className="lu-ws-quarter-stats">
            <strong>해당 분기 발송 메시지 {sentCount}건</strong>
            <span>·</span> 컨택 후보{" "}
            {
              candidateTasks.filter((task) => !task.sent && !task.noContact)
                .length
            }
            개 <span>·</span> 조사 예외 {exceptionCount}개
          </span>
        </div>
        <section className="lu-surface lu-ws-surface">
          <div className="lu-ws-controls">
            <div
              className="lu-ws-view-tabs"
              role="tablist"
              aria-label="후보 보기"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "companies"}
                className={view === "companies" ? "active" : ""}
                onClick={() => setView("companies")}
              >
                기업 보기
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "batches"}
                className={view === "batches" ? "active" : ""}
                onClick={() => setView("batches")}
              >
                탐색 배치 보기
              </button>
            </div>
            <div className="lu-ws-filters">
              <input
                type="search"
                aria-label="기업 검색"
                placeholder="기업 검색"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
              <select
                aria-label="담당자 필터"
                value={assignee}
                onChange={(event) => {
                  setAssignee(event.target.value);
                }}
              >
                <option value="all">담당자 전체</option>
                <option value={currentUser.id}>
                  내 담당 · {currentUser.name}
                </option>
                {assignedPeople.map(
                  (person) =>
                    person.id !== currentUser.id && (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ),
                )}
              </select>
            </div>
          </div>
          <div className="lu-ws-status-row">
            <div className="lu-ws-status-tabs">
              {(["all", "todo", "noContact", "sent"] as const).map((item) => (
                <button
                  key={item}
                  className={filter === item ? "active" : ""}
                  onClick={() => {
                    setFilter(item);
                  }}
                >
                  {item === "all"
                    ? "전체"
                    : item === "todo"
                      ? "발송 전"
                      : item === "noContact"
                        ? "연락하지 않음"
                        : "전송 완료"}
                </button>
              ))}
            </div>
          </div>
          <div className="lu-ws-content">
            <div className="lu-ws-list">
              {view === "companies" ? (
                <CandidateTable
                  tasks={visible}
                  companies={state.companies}
                  activeId={detailId}
                  onOpen={openDetail}
                  canEdit={canEdit}
                  onMessage={startContact}
                  label="현재 기업 목록"
                />
              ) : (
                <div className="lu-ws-batches">
                  {batches
                    .slice()
                    .reverse()
                    .map((batch: Batch) => {
                      if (assignee !== "all" && batch.assignee?.id !== assignee)
                        return null;
                      const rows = visible.filter(
                        (task) => task.batchId === batch.id,
                      );
                      const exceptions =
                        batch.quarter === state.quarter
                          ? batch.companyIds
                              .map((id) => companyById.get(id))
                              .filter(
                                (company): company is Company =>
                                  !!company &&
                                  (!hasContactOption(company) ||
                                    !!state.tasks.find(
                                      (task) => task.companyId === company.id,
                                    )?.needsResearch),
                              )
                          : [];
                      if (
                        !rows.length &&
                        !exceptions.length &&
                        (query || filter !== "all" || assignee !== "all")
                      )
                        return null;
                      return (
                        <section className="lu-ws-batch" key={batch.id}>
                          <button
                            className="lu-ws-batch-heading"
                            aria-expanded={expanded.has(batch.id)}
                            onClick={() =>
                              setExpanded((current) => {
                                const next = new Set(current);
                                next.has(batch.id)
                                  ? next.delete(batch.id)
                                  : next.add(batch.id);
                                return next;
                              })
                            }
                          >
                            <span className="lu-ws-chevron">
                              {expanded.has(batch.id) ? "▾" : "▸"}
                            </span>
                            <span className="lu-ws-batch-name">
                              <strong>
                                {batch.condition || "조건 없이 탐색"}
                              </strong>
                              <small>
                                {batch.createdAt} · 담당{" "}
                                {batch.assignee?.name ?? "미지정"} · 최대{" "}
                                {batch.researchLimit}개 조사
                              </small>
                            </span>
                            <span className="lu-ws-batch-total">
                              후보 {rows.length}개
                            </span>
                          </button>
                          {expanded.has(batch.id) && (
                            <>
                              <CandidateTable
                                tasks={rows}
                                companies={state.companies}
                                activeId={detailId}
                                onOpen={openDetail}
                                canEdit={canEdit}
                                onMessage={startContact}
                                label={`${batch.condition || "조건 없이 탐색"} 후보`}
                              />
                              <div className="lu-ws-exception-line">
                                <span>
                                  조사 예외 {exceptions.length}개
                                  {batch.excludedCount
                                    ? ` · 중복 ${batch.excludedCount}개 제외`
                                    : ""}
                                </span>
                                {exceptions.length > 0 && (
                                  <button
                                    className="lu-text-button"
                                    onClick={() =>
                                      setShowExceptions(
                                        showExceptions === batch.id
                                          ? null
                                          : batch.id,
                                      )
                                    }
                                  >
                                    {showExceptions === batch.id
                                      ? "닫기"
                                      : "조사 내역 보기"}
                                  </button>
                                )}
                              </div>
                              {showExceptions === batch.id && (
                                <div className="lu-ws-exception-list">
                                  {exceptions.map((company) => (
                                    <button
                                      key={company.id}
                                      onClick={() => openDetail(company.id)}
                                    >
                                      <strong>{company.name}</strong>
                                      <span>
                                        {state.tasks.find(
                                          (task) =>
                                            task.companyId === company.id,
                                        )?.needsResearch
                                          ? "연락 경로 재조사 필요"
                                          : company.fit === "fit"
                                            ? "연락 창구 미확보"
                                            : `fit ${fitLabel[company.fit]}`}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </section>
                      );
                    })}
                  {!batches.length && (
                    <div className="lu-empty">
                      이 분기의 첫 탐색을 시작해보세요.
                    </div>
                  )}
                </div>
              )}
            </div>
            {!messagePage && activeCompany && (
              <button
                className="lu-ws-detail-scrim"
                aria-label="기업 상세 닫기"
                onClick={() => setDetailId(null)}
              />
            )}
            {!messagePage && activeCompany && (
              <aside
                ref={detailRef}
                className={`lu-ws-detail ${activeCompany ? "is-open" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="lu-company-detail-title"
              >
                {activeCompany ? (
                  <>
                    <div className="lu-ws-detail-head">
                      <div>
                        <span className="lu-ws-eyebrow">기업 상세</span>
                        <h2 id="lu-company-detail-title">
                          {activeCompany.name}
                        </h2>
                        <p>{activeCompany.service}</p>
                        <div className="lu-panel-context">
                          <span>
                            {quarterLabel(
                              activeTask?.quarter ??
                                activeBatch?.quarter ??
                                state.quarter,
                            )}
                          </span>
                          <span>
                            {activeBatch?.assignee?.name ?? "담당자 미지정"}
                          </span>
                        </div>
                      </div>
                      <button
                        ref={closeDetailRef}
                        className="lu-icon-button"
                        aria-label="상세 닫기"
                        onClick={() => setDetailId(null)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="lu-ws-detail-scroll">
                      {!canEditActive && (
                        <div className="lu-ws-readonly" role="note">
                          <strong>조회 전용</strong>
                          <span>
                            {activeBatch?.assignee?.name ?? "담당자 미지정"}의
                            업무입니다. 변경과 전송은 담당자 또는 팀장만 할 수
                            있어요.
                          </span>
                        </div>
                      )}
                      <div className="lu-ws-detail-section lu-ws-fit-section">
                        <div className="lu-section-head">
                          <h3>협업 접점</h3>
                          <span
                            className={`lu-ws-fit-chip ${activeCompany.fit}`}
                          >
                            {fitLabel[activeCompany.fit]}
                          </span>
                        </div>
                        <p className="lu-panel-about">{activeCompany.about}</p>
                        <strong>{activeCompany.area}</strong>
                        <p className="lu-ws-fit-summary">
                          {activeCompany.possibility}
                        </p>
                        <details
                          className="lu-ws-disclosure"
                          key={activeCompany.id}
                        >
                          <summary>
                            {canEditActive ? "판단 근거·수정" : "판단 근거"}
                          </summary>
                          <p className="lu-ws-meta">
                            AI 최초 판단 · {fitLabel[activeCompany.aiFit]}
                            {activeCompany.fitChanges.length > 0 &&
                              ` / 최근 사람 수정 · ${activeCompany.fitChanges.at(-1)?.by?.name ?? "수정자 기록 없음"} · ${formatActivityTime(activeCompany.fitChanges.at(-1)?.at ?? null)}`}
                          </p>
                          <p>{activeCompany.possibility}</p>
                          <p>{activeCompany.value}</p>
                          <small>
                            실제 우선순위와 실행 권한은 기업과 확인이
                            필요합니다.
                          </small>
                          <label className="lu-ws-fit-edit">
                            fit 판단 변경
                            <select
                              aria-label="fit 판단 변경"
                              value={activeCompany.fit}
                              disabled={!canEditActive}
                              onChange={(event) =>
                                setFit(
                                  activeCompany.id,
                                  event.target.value as Fit,
                                )
                              }
                            >
                              {(["fit", "pending", "unfit"] as const).map(
                                (fit) => (
                                  <option key={fit} value={fit}>
                                    {fitLabel[fit]}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        </details>
                      </div>
                      <div className="lu-ws-detail-section">
                        <div className="lu-section-head">
                          <h3>관계자 · 연락 경로</h3>
                          {canEditActive && (
                            <button
                              onClick={() => setNewPersonOpen((open) => !open)}
                            >
                              직접 추가
                            </button>
                          )}
                        </div>
                        {activeCompany.people.map((person) => (
                          <div key={person.id} className="lu-ws-person">
                            <div className="lu-panel-person-heading">
                              <span
                                className="lu-panel-avatar"
                                aria-hidden="true"
                              >
                                {person.name.slice(0, 1)}
                              </span>
                              <div>
                                <strong>{person.name}</strong>
                                <small>{person.role}</small>
                              </div>
                            </div>
                            <div className="lu-ws-person-options">
                              {person.linkedin && (
                                <button
                                  className="lu-text-button"
                                  onClick={() =>
                                    notify(
                                      "시연용 관계자라 실제 LinkedIn 프로필은 연결되지 않았습니다.",
                                    )
                                  }
                                >
                                  LinkedIn 프로필 보기
                                </button>
                              )}
                              {person.email && <span>{person.email}</span>}
                            </div>
                          </div>
                        ))}
                        {!activeCompany.people.length && (
                          <p className="lu-muted">
                            조사된 연락 창구가 없습니다.
                          </p>
                        )}
                        {newPersonOpen && (
                          <div className="lu-ws-add-person">
                            <label>
                              이름
                              <input
                                value={newPerson.name}
                                onChange={(event) =>
                                  setNewPerson({
                                    ...newPerson,
                                    name: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              직무
                              <input
                                value={newPerson.role}
                                onChange={(event) =>
                                  setNewPerson({
                                    ...newPerson,
                                    role: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              이메일
                              <input
                                type="email"
                                value={newPerson.email}
                                onChange={(event) =>
                                  setNewPerson({
                                    ...newPerson,
                                    email: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              LinkedIn URL
                              <input
                                type="url"
                                value={newPerson.linkedin}
                                onChange={(event) =>
                                  setNewPerson({
                                    ...newPerson,
                                    linkedin: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <button
                              className="lu-primary"
                              disabled={
                                !newPerson.name.trim() ||
                                (!newPerson.email.trim() &&
                                  !newPerson.linkedin.trim())
                              }
                              onClick={() => {
                                addPerson(activeCompany.id, {
                                  name: newPerson.name.trim(),
                                  role: newPerson.role.trim() || "담당자",
                                  ...(newPerson.email.trim()
                                    ? { email: newPerson.email.trim() }
                                    : {}),
                                  ...(newPerson.linkedin.trim()
                                    ? { linkedin: newPerson.linkedin.trim() }
                                    : {}),
                                });
                                setNewPerson({
                                  name: "",
                                  role: "",
                                  email: "",
                                  linkedin: "",
                                });
                                setNewPersonOpen(false);
                              }}
                            >
                              연락 창구 추가
                            </button>
                          </div>
                        )}
                        {canEditActive && !activeTask?.sent && (
                          <details
                            className="lu-ws-disclosure lu-ws-contact-more"
                            key={`${activeCompany.id}-${!!activeTask?.needsResearch}`}
                            open={!activeTask || activeTask.needsResearch}
                          >
                            <summary>연락 경로 재조사</summary>
                            <p className="lu-ws-meta">
                              LinkedIn 활동은 프로필에서 직접 확인하세요.
                            </p>
                            {activeTask && !activeTask.needsResearch && (
                              <button
                                className="lu-text-button lu-ws-research-link"
                                onClick={() => {
                                  updateTask(activeCompany.id, {
                                    needsResearch: true,
                                    personId: null,
                                    channel: null,
                                  });
                                  setDetailId(null);
                                  notify(
                                    "연락 경로 재조사 대상으로 표시했어요. 조사 내역에서 다시 열 수 있습니다.",
                                  );
                                }}
                              >
                                적절한 연락 경로가 없어요 · 재조사 필요
                              </button>
                            )}
                            {activeTask?.needsResearch &&
                              hasContactOption(activeCompany) && (
                                <button
                                  className="lu-text-button lu-ws-research-link"
                                  onClick={() =>
                                    updateTask(activeCompany.id, {
                                      needsResearch: false,
                                    })
                                  }
                                >
                                  기존 연락 경로로 후보 복귀
                                </button>
                              )}
                            {(!activeTask || activeTask.needsResearch) &&
                              activeCompany.fit === "fit" && (
                                <button
                                  className="lu-primary lu-ws-research-button"
                                  onClick={() =>
                                    researchContact(activeCompany.id)
                                  }
                                >
                                  연락 창구 추가 조사 (예시)
                                </button>
                              )}
                          </details>
                        )}
                      </div>
                      {activeTask && (
                        <section className="lu-panel-action">
                          <div className="lu-section-head">
                            <h3>연락 진행</h3>
                            <span className="lu-panel-status">
                              {activeTask.sent
                                ? "발송 완료"
                                : activeTask.noContact
                                  ? "연락하지 않음"
                                  : contactStage(activeTask) === "ready_to_send"
                                    ? "발송 준비 완료"
                                    : contactStage(activeTask) ===
                                        "draft_review"
                                      ? "초안 승인 전"
                                      : contactStage(activeTask) ===
                                          "recipient_selection"
                                        ? "수신자 · 채널 선택"
                                        : "컨택 시작 전"}
                            </span>
                          </div>
                          <p>
                            {activeTask.noContact
                              ? "이번 탐색에서 연락하지 않도록 표시했어요."
                              : activeTask.sent
                                ? "전송한 메시지와 발송 기록을 확인할 수 있어요."
                                : "메시지 페이지에서 수신자와 채널을 먼저 선택하고 초안을 생성하세요."}
                          </p>
                          <div className="lu-panel-action-buttons">
                            {(activeTask.sent ||
                              contactStage(activeTask) ||
                              (canEditActive &&
                                hasContactOption(activeCompany))) && (
                              <button
                                className="lu-primary"
                                onClick={() => startContact(activeTask)}
                                disabled={
                                  !!activeTask.noContact && !activeTask.sent
                                }
                              >
                                {activeTask.sent || contactStage(activeTask)
                                  ? "메시지 열기"
                                  : "컨택 시작"}{" "}
                                →
                              </button>
                            )}
                            {!contactStage(activeTask) &&
                              !hasContactOption(activeCompany) && (
                                <p className="lu-ws-meta">
                                  적합 판정과 사용 가능한 연락처가 있어야 컨택을
                                  시작할 수 있어요.
                                </p>
                              )}
                            {canEditActive && !activeTask.sent && (
                              <button
                                onClick={() => {
                                  updateTask(activeCompany.id, {
                                    noContact: !activeTask.noContact,
                                  });
                                  setEditing(false);
                                }}
                              >
                                {activeTask.noContact
                                  ? "연락하지 않음 취소"
                                  : "이번 탐색에서 연락하지 않음"}
                              </button>
                            )}
                          </div>
                        </section>
                      )}
                      <details className="lu-ws-disclosure lu-ws-other">
                        <summary>분기 · 발견 이력</summary>
                        {canEditActive && activeTask && !activeTask.sent && (
                          <div className="lu-ws-move">
                            <label>
                              목표 분기 변경
                              <select
                                value={moveQuarter}
                                onChange={(event) =>
                                  setMoveQuarter(event.target.value)
                                }
                              >
                                {state.quarters.map((item) => (
                                  <option key={item} value={item}>
                                    {quarterLabel(item)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              disabled={moveQuarter === activeTask.quarter}
                              onClick={() => {
                                moveTask(activeCompany.id, moveQuarter);
                                setDetailId(null);
                                notify(
                                  `${activeCompany.name}의 목표 분기를 옮겼어요. 발견 배치 이력은 유지됩니다.`,
                                );
                              }}
                            >
                              이동
                            </button>
                          </div>
                        )}
                        <p>공식 사이트·서비스 소개 자료 (목업 예시)</p>
                        <p>
                          발견 배치 ·{" "}
                          {activeBatch?.condition || "조건 없이 탐색"} /{" "}
                          {activeBatch
                            ? quarterLabel(activeBatch.quarter)
                            : "미확인"}
                        </p>
                      </details>
                    </div>
                  </>
                ) : (
                  <div className="lu-ws-no-detail">
                    <strong>기업을 선택하세요</strong>
                    <p>
                      조사 근거를 확인하고 수신자·전송 수단·메시지를 한곳에서
                      결정할 수 있어요.
                    </p>
                  </div>
                )}
              </aside>
            )}
          </div>
        </section>
      </div>
      {messagePage && (
        <section className="lu-message-page" aria-label="메시지 편집 및 발송">
          <header className="lu-message-page-head">
            <button className="lu-text-button" onClick={backToResults}>
              ← 조사 결과로 돌아가기
            </button>
            <h1 ref={messageHeadingRef} tabIndex={-1}>
              {activeCompany?.name ?? "대상 없음"} · 메시지
            </h1>
            <p className="lu-muted">
              수신자·채널 선택 → 메시지 생성 → 초안 승인 순으로 준비하세요.
            </p>
          </header>
          {activeCompany && activeTask ? (
            <div className="lu-message-layout">
              <section className="lu-surface lu-message-document">
                <h2>{activeTask.sent ? "전송한 메시지" : "메시지"}</h2>
                {editing ? (
                  <>
                    <label className="lu-field">
                      제목
                      <input
                        value={editSubject}
                        onChange={(event) => setEditSubject(event.target.value)}
                      />
                    </label>
                    <label className="lu-field">
                      본문
                      <textarea
                        className="lu-ws-message-editor"
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <div className="lu-ws-draft-preview">
                    <strong>
                      {activeTask.sent?.subject ?? activeTask.subject}
                    </strong>
                    <div
                      className={`lu-ws-message-body ${messageExpanded ? "expanded" : "collapsed"}`}
                    >
                      {activeTask.sent?.body ??
                        resolvedBody(activeTask, activeCompany)}
                    </div>
                    {!!activeTask.body.trim() && (
                      <button
                        className="lu-text-button"
                        aria-expanded={messageExpanded}
                        onClick={() => setMessageExpanded((open) => !open)}
                      >
                        {messageExpanded ? "본문 접기" : "메시지 전문 보기"}
                      </button>
                    )}
                  </div>
                )}
                {!activeTask.body.trim() && !activeTask.sent && (
                  <p>
                    아직 생성한 메시지가 없습니다. 오른쪽에서 수신자와 채널을
                    선택한 뒤 메시지 생성 버튼을 눌러주세요.
                  </p>
                )}
                {activeTask.sent && (
                  <p className="lu-ws-meta">
                    {new Date(activeTask.sent.at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    · 수동 전송 기록
                  </p>
                )}
              </section>
              <div className="lu-message-sidebar">
                <section className="lu-surface lu-message-tools">
                  <h2>메시지 준비</h2>
                  {!contactStage(activeTask) && !activeTask.sent && (
                    <>
                      <p className="lu-ws-meta">
                        적합 판정과 사용 가능한 연락처가 있는 대상만 컨택을
                        시작할 수 있어요.
                      </p>
                      <button
                        className="lu-primary"
                        disabled={
                          !canEditActive ||
                          !!activeTask.noContact ||
                          !hasContactOption(activeCompany)
                        }
                        onClick={() => startContact(activeTask)}
                      >
                        컨택 시작
                      </button>
                    </>
                  )}
                  {canEditActive &&
                  !activeTask.sent &&
                  !activeTask.noContact &&
                  activeTask.body.trim() &&
                  contactStage(activeTask) !== "recipient_selection" ? (
                    <>
                      <div className="lu-message-tool-buttons">
                        {editing ? (
                          <>
                            <button
                              className="lu-primary"
                              disabled={!editSubject.trim() || !editBody.trim()}
                              onClick={() => {
                                updateTask(activeCompany.id, {
                                  subject: editSubject,
                                  body: editBody,
                                });
                                setEditing(false);
                              }}
                            >
                              저장
                            </button>
                            <button onClick={() => setEditing(false)}>
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditSubject(activeTask.subject);
                                setEditBody(activeTask.body);
                                setEditing(true);
                                setMessageExpanded(true);
                              }}
                            >
                              수정
                            </button>
                            <button
                              onClick={() => {
                                updateTask(activeCompany.id, {
                                  workStage: "recipient_selection",
                                });
                              }}
                            >
                              수신자 변경 · 재생성
                            </button>
                          </>
                        )}
                      </div>
                      {!editing &&
                        contactStage(activeTask) === "draft_review" && (
                          <button
                            className="lu-primary"
                            onClick={() =>
                              updateTask(activeCompany.id, {
                                workStage: "ready_to_send",
                              })
                            }
                          >
                            초안 승인
                          </button>
                        )}
                      {contactStage(activeTask) === "ready_to_send" && (
                        <p role="status">승인 완료 · 발송 준비됨</p>
                      )}
                    </>
                  ) : (
                    <p className="lu-ws-meta">
                      {canEditActive &&
                      !activeTask.sent &&
                      !activeTask.noContact
                        ? "메시지 생성 후 내용을 수정하고 승인할 수 있어요."
                        : "현재 메시지는 조회만 가능합니다."}
                    </p>
                  )}
                  {canEditActive &&
                    !activeTask.sent &&
                    !activeTask.noContact &&
                    contactStage(activeTask) === "recipient_selection" && (
                      <>
                        <p className="lu-ws-meta">
                          수신자와 채널을 선택한 뒤 생성하세요. 기존 초안이
                          있으면 새 초안으로 바뀝니다.
                        </p>
                        <button
                          className="lu-primary"
                          disabled={
                            !canGenerateDraft(activeTask, activeCompany)
                          }
                          onClick={() => {
                            if (!canGenerateDraft(activeTask, activeCompany))
                              return;
                            updateTask(activeCompany.id, {
                              ...draftFor(activeCompany, activeTask.quarter),
                              status: "ready",
                              workStage: "draft_review",
                            });
                            notify(
                              "샘플 초안을 생성했어요. 실제 생성 API는 아직 연결되지 않았습니다.",
                            );
                          }}
                        >
                          {activeTask.body.trim()
                            ? "메시지 다시 생성"
                            : "메시지 생성"}
                        </button>
                        {!!activeTask.body.trim() && (
                          <button
                            disabled={
                              !canGenerateDraft(activeTask, activeCompany)
                            }
                            onClick={() =>
                              updateTask(activeCompany.id, {
                                workStage: "draft_review",
                              })
                            }
                          >
                            기존 초안 검토
                          </button>
                        )}
                      </>
                    )}
                </section>
                <aside className="lu-surface lu-message-recipient">
                  <h2>수신자 · 채널</h2>
                  <p className="lu-ws-meta">
                    {quarterLabel(activeTask.quarter)} ·{" "}
                    {activeBatch?.assignee?.name ?? "담당자 미지정"}
                  </p>
                  {activeTask.sent ? (
                    <p>
                      {activeTask.sent.recipient} ·{" "}
                      {activeTask.sent.channel === "linkedin"
                        ? "LinkedIn"
                        : "이메일"}{" "}
                      · 발송 완료
                    </p>
                  ) : (
                    <>
                      <label className="lu-field">
                        수신자
                        <select
                          aria-label="메시지 수신자"
                          value={activeTask.personId ?? ""}
                          disabled={
                            !canEditActive ||
                            editing ||
                            !!activeTask.noContact ||
                            contactStage(activeTask) !== "recipient_selection"
                          }
                          onChange={(event) =>
                            updateTask(activeCompany.id, {
                              personId: event.target.value || null,
                              channel: null,
                            })
                          }
                        >
                          <option value="">수신자를 선택하세요</option>
                          {activeCompany.people.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name} · {person.role}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!activeCompany.people.length && (
                        <p className="lu-ws-meta">
                          조사된 연락처가 없습니다. 조사 결과에서 연락처를
                          확인하세요.
                        </p>
                      )}
                      <label className="lu-field">
                        채널
                        <select
                          aria-label="메시지 채널"
                          value={activeTask.channel ?? ""}
                          disabled={
                            !canEditActive ||
                            editing ||
                            !activePerson ||
                            contactStage(activeTask) !==
                              "recipient_selection" ||
                            !!activeTask.noContact
                          }
                          onChange={(event) =>
                            updateTask(activeCompany.id, {
                              channel: (event.target.value ||
                                null) as Channel | null,
                            })
                          }
                        >
                          <option value="">채널을 선택하세요</option>
                          <option
                            value="linkedin"
                            disabled={!activePerson?.linkedin}
                          >
                            LinkedIn
                          </option>
                          <option value="email" disabled={!activePerson?.email}>
                            이메일
                          </option>
                        </select>
                      </label>
                      {activeTask.channel === "linkedin" &&
                        activePerson?.linkedin &&
                        /^https?:\/\//i.test(activePerson.linkedin) && (
                          <a
                            className="lu-message-profile-link"
                            href={activePerson.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            LinkedIn 프로필 열기 ↗
                          </a>
                        )}
                      {activeTask.channel === "email" &&
                        activePerson?.email && (
                          <p className="lu-ws-meta">{activePerson.email}</p>
                        )}
                      {!canEditActive && (
                        <p role="note">
                          조회 전용 · 담당자 또는 팀장이 수정할 수 있어요.
                        </p>
                      )}
                      {activeTask.noContact && (
                        <p role="status">
                          이번 탐색에서 연락하지 않음으로 표시한 대상입니다.
                        </p>
                      )}
                      {canEditActive &&
                        !activeTask.noContact &&
                        !!activeTask.body.trim() && (
                          <div className="lu-message-send-actions">
                            <p className="lu-ws-meta">
                              초안 승인 후 내용을 복사해 선택한 채널에서
                              전송하세요. 발송 결과 저장 API는 아직 제공되지
                              않았습니다.
                            </p>
                            <div className="lu-message-copy-actions">
                              <button
                                disabled={!canSendActive || editing}
                                onClick={() =>
                                  void copy(activeTask.subject, "제목")
                                }
                              >
                                제목 복사
                              </button>
                              <button
                                disabled={!canSendActive || editing}
                                onClick={() =>
                                  void copy(
                                    resolvedBody(activeTask, activeCompany),
                                    "본문",
                                  )
                                }
                              >
                                본문 복사
                              </button>
                            </div>
                            <button
                              className="lu-primary"
                              disabled
                              title="발송 결과 저장 API 연결 대기"
                            >
                              전송 완료 저장 (연결 대기)
                            </button>
                          </div>
                        )}
                    </>
                  )}
                </aside>
              </div>
            </div>
          ) : (
            <p>
              해당 대상을 찾을 수 없습니다. 조사 결과로 돌아가 대상을
              선택하세요.
            </p>
          )}
        </section>
      )}
      {searchOpen && (
        <SearchDialog
          currentUser={currentUser}
          currentQuarter={state.quarter}
          availableQuarters={state.quarters}
          onStart={startSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {manualConfirm && activeCompany && activePerson && (
        <div
          className="lu-overlay"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setManualConfirm(false)
          }
        >
          <section
            className="lu-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="전송 완료 확인"
          >
            <h2>
              {activeTask?.channel === "email" ? "이메일" : "LinkedIn"} 전송
              기록
            </h2>
            <p>
              {activeCompany.name}의 {activePerson.name}님께 직접 전송했나요?
            </p>
            <p className="lu-muted">
              복사만으로는 발송 수에 포함되지 않습니다. 완료 표시는 전송 기록만
              저장합니다.
            </p>
            <div className="lu-dialog-actions">
              <button onClick={() => setManualConfirm(false)}>취소</button>
              <button
                className="lu-primary"
                onClick={() => {
                  if (activeTask?.channel)
                    send([activeCompany.id], activeTask.channel);
                }}
              >
                직접 전송했어요
              </button>
            </div>
          </section>
        </div>
      )}
      {emailReviewIds.length > 0 && (
        <div
          className="lu-overlay"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setEmailReviewIds([])
          }
        >
          <section
            className="lu-dialog lu-ws-email-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="이메일 발송 검토"
          >
            <h2>이메일 발송 전 확인</h2>
            <p className="lu-muted">
              사람이 이메일을 선택한 기업만 포함됩니다. 수신자와 실제 적용된
              메시지를 확인하세요.
            </p>
            <div className="lu-ws-email-list">
              {emailReviewIds.map((id) => {
                const task = state.tasks.find((item) => item.companyId === id)!;
                const company = companyById.get(id)!;
                const person = company.people.find(
                  (item) => item.id === task.personId,
                )!;
                return (
                  <div key={id}>
                    <strong>
                      {company.name} · {person.name}
                    </strong>
                    <small>{person.email}</small>
                    <p>
                      <b>제목</b> {task.subject}
                    </p>
                    <p className="lu-ws-email-body">
                      {resolvedBody(task, company)}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="lu-dialog-actions">
              <button onClick={() => setEmailReviewIds([])}>취소</button>
              <button
                className="lu-primary"
                onClick={() => send(emailReviewIds, "email")}
              >
                확인 후 {emailReviewIds.length}건 발송 (시뮬레이션)
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
