import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  extraCompanies,
  initialState,
  initialSelectionPreviewState,
  normalizeStoredState,
} from "./fixtures";
import type { Company, ContactTask, Fit, ListupState, Person } from "./model";
import {
  canManageCompany,
  prepareCandidateTasks,
  previewUsers,
  reviewFit,
} from "./model";
import { WorkspacePage } from "./WorkspacePage";
import "./styles.css";

const storageKey = "dhbot-listup-frontend-v1";
const selectionPreview =
  new URLSearchParams(window.location.search).get("selectionPreview") === "1";

function readState(): ListupState {
  if (selectionPreview)
    return prepareCandidateTasks(initialSelectionPreviewState());
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as ListupState;
      if (
        Array.isArray(parsed.companies) &&
        Array.isArray(parsed.batches) &&
        Array.isArray(parsed.tasks)
      ) {
        return prepareCandidateTasks(normalizeStoredState(parsed));
      }
    }
  } catch {
    /* Corrupt sample data falls back to fixtures. */
  }
  return prepareCandidateTasks(initialState());
}

function Root() {
  const [state, setState] = useState(readState);
  const [toast, setToast] = useState("");
  const [currentUser, setCurrentUser] = useState(previewUsers[0]);
  document.title = "대협 어드민 · 수주 후보";

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 5000);
  }
  function save(next: ListupState) {
    const prepared = prepareCandidateTasks(next);
    setState(prepared);
    if (!selectionPreview)
      window.localStorage.setItem(storageKey, JSON.stringify(prepared));
  }
  function setQuarter(quarter: string) {
    if (state.quarters.includes(quarter)) save({ ...state, quarter });
  }
  function updateCompany(id: string, patch: Partial<Company>) {
    if (!allowEdit(id)) return;
    save({
      ...state,
      companies: state.companies.map((company) =>
        company.id === id ? { ...company, ...patch } : company,
      ),
    });
  }
  function setFit(id: string, fit: Fit) {
    const company = state.companies.find((item) => item.id === id);
    if (company && company.fit !== fit)
      updateCompany(
        id,
        reviewFit(company, fit, currentUser, new Date().toISOString()),
      );
  }
  function researchContact(id: string) {
    if (!allowEdit(id)) return;
    const company = state.companies.find((item) => item.id === id);
    if (!company || company.fit !== "fit") return;
    const hasSample = company.people.some(
      (person) => person.id === `${id}-sample`,
    );
    save({
      ...state,
      companies: state.companies.map((item) =>
        item.id === id && !hasSample
          ? {
              ...item,
              people: [
                ...item.people,
                {
                  id: `${id}-sample`,
                  name: "김서연",
                  role: "Product Manager",
                  email: "contact@example.com",
                  linkedin: "https://www.linkedin.com/",
                },
              ],
            }
          : item,
      ),
      tasks: state.tasks.map((task) =>
        task.companyId === id ? { ...task, needsResearch: false } : task,
      ),
    });
    notify("예시 연락 창구를 보완했어요. 실제 조사 API는 연결되지 않았습니다.");
  }
  function addPerson(id: string, person: Omit<Person, "id">) {
    if (!allowEdit(id)) return;
    const company = state.companies.find((item) => item.id === id);
    if (!company) return;
    save({
      ...state,
      companies: state.companies.map((item) =>
        item.id === id
          ? {
              ...item,
              people: [
                ...item.people,
                { ...person, id: `${id}-manual-${Date.now()}` },
              ],
            }
          : item,
      ),
      tasks: state.tasks.map((task) =>
        task.companyId === id ? { ...task, needsResearch: false } : task,
      ),
    });
    notify(
      "연락 창구를 추가했어요. 실제 운영에서는 출처와 재직 확인이 필요합니다.",
    );
  }
  function updateTask(id: string, patch: Partial<ContactTask>) {
    if (!allowEdit(id)) return;
    save({
      ...state,
      tasks: state.tasks.map((task) =>
        task.companyId === id ? { ...task, ...patch } : task,
      ),
    });
  }
  function updateTasks(updates: { id: string; patch: Partial<ContactTask> }[]) {
    if (updates.some((update) => !allowEdit(update.id))) return;
    save({
      ...state,
      tasks: state.tasks.map((task) => {
        const update = updates.find((item) => item.id === task.companyId);
        return update ? { ...task, ...update.patch } : task;
      }),
    });
  }
  function moveTask(id: string, quarter: string) {
    if (!allowEdit(id)) return;
    if (!state.quarters.includes(quarter)) return;
    save({
      ...state,
      tasks: state.tasks.map((task) =>
        task.companyId === id && !task.sent ? { ...task, quarter } : task,
      ),
    });
  }
  function startSearch(
    condition: string | null,
    sources: string[],
    researchLimit: number,
    quarter: string,
  ) {
    const known = new Set(state.batches.flatMap((batch) => batch.companyIds));
    const found = extraCompanies
      .filter((company) => !known.has(company.id))
      .slice(0, researchLimit);
    const batch = {
      id: `batch-${Date.now()}`,
      quarter,
      condition,
      createdAt: new Date().toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      assignee: currentUser,
      sources,
      companyIds: found.map((company) => company.id),
      excludedCount: 0,
      researchLimit,
    };
    save({
      ...state,
      quarter,
      quarters: state.quarters.includes(quarter)
        ? state.quarters
        : [...state.quarters, quarter].sort(),
      companies: [
        ...state.companies,
        ...found.filter(
          (company) => !state.companies.some((item) => item.id === company.id),
        ),
      ],
      batches: [...state.batches, batch],
    });
    notify(
      `샘플 기업 ${found.length}개를 조사했어요. 중복 기업은 분기와 관계없이 제외됩니다.`,
    );
  }

  function allowEdit(companyId: string) {
    if (canManageCompany(state, currentUser, companyId)) return true;
    notify(
      "다른 담당자의 업무는 조회만 가능해요. 변경은 담당자 또는 팀장만 할 수 있습니다.",
    );
    return false;
  }

  return (
    <div className="lu-shell">
      <aside className="lu-sidebar" aria-label="주 메뉴">
        <div className="lu-brand">
          <span>G</span>대협 어드민
        </div>
        <div className="lu-side-label">신규 수주</div>
        <nav>
          <button className="active" type="button">
            ⌕ <span>수주 후보</span>
          </button>
        </nav>
        <div className="lu-side-note">
          프론트엔드 개발 미리보기
          <br />
          실제 검색·발송 없음
        </div>
      </aside>
      <div className="lu-workspace">
        <header className="lu-topbar">
          <strong>대협 어드민</strong>
          <span>개발용 샘플 · 실제 외부 발송 없음</span>
          <label className="lu-preview-user">
            권한 미리보기
            <select
              aria-label="권한 미리보기 사용자"
              value={currentUser.id}
              onChange={(event) => {
                setCurrentUser(
                  previewUsers.find((user) => user.id === event.target.value)!,
                );
                setToast("");
              }}
            >
              {previewUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        {selectionPreview && (
          <div className="lu-ws-preview-notice">
            <strong>전체 선택 검토용 샘플</strong> · 가상 기업 48개 / 배치별
            24개. 기존 목업 데이터에는 영향을 주지 않습니다.
            <a href="/listup.html">기본 목업으로 돌아가기</a>
          </div>
        )}
        <WorkspacePage
          key={currentUser.id}
          currentUser={currentUser}
          state={state}
          setQuarter={setQuarter}
          setFit={setFit}
          researchContact={researchContact}
          addPerson={addPerson}
          updateTask={updateTask}
          updateTasks={updateTasks}
          moveTask={moveTask}
          startSearch={startSearch}
          notify={notify}
        />
      </div>
      {toast && (
        <div className="lu-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
