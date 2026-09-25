import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { extraCompanies, initialState } from "./fixtures";
import type { Company, ContactTask, Fit, ListupState } from "./model";
import { canHandoff, draftFor, quarters } from "./model";
import { SourcingPage } from "./SourcingPage";
import { ContactPage } from "./ContactPage";
import "./styles.css";

const storageKey = "dhbot-listup-frontend-v1";
function readState(): ListupState {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value) {
      const parsed = JSON.parse(value) as ListupState;
      if (Array.isArray(parsed.companies) && Array.isArray(parsed.batches) && Array.isArray(parsed.tasks)) return parsed;
    }
  } catch { /* Corrupt sample data falls back to fixtures. */ }
  return initialState();
}

function Root() {
  const [state, setState] = useState(readState);
  const [page, setPage] = useState<"sourcing" | "contact">(window.location.hash === "#contact" ? "contact" : "sourcing");
  const [toast, setToast] = useState("");
  useEffect(() => {
    const sync = () => setPage(window.location.hash === "#contact" ? "contact" : "sourcing");
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => { document.title = `대협 어드민 · ${page === "contact" ? "컨택 작업" : "기업 탐색"}`; }, [page]);
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 3500); }
  function save(next: ListupState) { setState(next); window.localStorage.setItem(storageKey, JSON.stringify(next)); }
  function navigate(next: "sourcing" | "contact") { setPage(next); window.location.hash = next; window.scrollTo(0, 0); }
  function setQuarter(quarter: string) { if (quarters.includes(quarter)) save({ ...state, quarter }); }
  function updateCompany(id: string, patch: Partial<Company>) {
    save({ ...state, companies: state.companies.map((company) => company.id === id ? { ...company, ...patch } : company) });
  }
  function setFit(id: string, fit: Fit) { updateCompany(id, { fit, changedByUser: true }); }
  function researchContact(id: string) {
    const company = state.companies.find((item) => item.id === id);
    if (!company || company.fit !== "fit") return;
    updateCompany(id, { people: [...company.people, { id: `${id}-sample`, name: "김서연", role: "Product Manager", email: "contact@example.com", linkedin: "https://www.linkedin.com/" }] });
    notify("예시 연락 창구를 추가했어요. 실제 조사는 연결되지 않았습니다.");
  }
  function addTasks(ids: string[]) {
    const existing = new Set(state.tasks.map((task) => `${task.quarter}:${task.companyId}`));
    const tasks: ContactTask[] = ids.flatMap((id) => {
      const company = state.companies.find((item) => item.id === id);
      const batch = state.batches.find((item) => item.quarter === state.quarter && item.companyIds.includes(id));
      if (!company || !batch || !canHandoff(company) || existing.has(`${state.quarter}:${id}`)) return [];
      const draft = draftFor(company);
      return [{ companyId: id, quarter: state.quarter, batchId: batch.id, status: "pending" as const, ...draft, personId: null, channel: null, sent: null }];
    });
    if (tasks.length) save({ ...state, tasks: [...state.tasks, ...tasks] });
    notify(`${tasks.length}개 기업을 컨택 작업에 추가했어요.`);
  }
  function updateTask(id: string, patch: Partial<ContactTask>) {
    save({ ...state, tasks: state.tasks.map((task) => task.quarter === state.quarter && task.companyId === id ? { ...task, ...patch } : task) });
  }
  function updateTasks(updates: { id: string; patch: Partial<ContactTask> }[]) {
    save({ ...state, tasks: state.tasks.map((task) => {
      const update = updates.find((item) => item.id === task.companyId && task.quarter === state.quarter);
      return update ? { ...task, ...update.patch } : task;
    }) });
  }
  function startSearch(condition: string | null, sources: string[], limit: number, quarter: string) {
    const existing = new Set(state.batches.filter((batch) => batch.quarter === quarter).flatMap((batch) => batch.companyIds));
    const pool = [...state.companies, ...extraCompanies.filter((company) => !state.companies.some((item) => item.id === company.id))];
    const found = pool.filter((company) => !existing.has(company.id)).slice(0, limit);
    const batch = { id: `batch-${Date.now()}`, quarter, condition, createdAt: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }), sources, companyIds: found.map((company) => company.id), excludedCount: existing.size };
    save({ ...state, quarter, companies: [...state.companies, ...found.filter((company) => !state.companies.some((item) => item.id === company.id))], batches: [...state.batches, batch] });
    notify(`신규 ${found.length}개 기업을 찾았어요. 실제 검색 API는 아직 연결되지 않았습니다.`);
  }
  return <div className="lu-shell">
    <aside className="lu-sidebar" aria-label="주 메뉴"><div className="lu-brand"><span>G</span>대협 어드민</div><div className="lu-side-label">신규 수주</div><nav><button className={page === "sourcing" ? "active" : ""} onClick={() => navigate("sourcing")}>⌕ <span>기업 탐색</span></button><button className={page === "contact" ? "active" : ""} onClick={() => navigate("contact")}>✉ <span>컨택 작업</span></button></nav><div className="lu-side-note">프론트엔드 개발 미리보기<br />실제 검색·발송 없음</div></aside>
    <div className="lu-workspace"><header className="lu-topbar"><strong>대협 어드민</strong><span>개발용 샘플 · 실제 외부 발송 없음</span></header>
      {page === "sourcing" ? <SourcingPage state={state} setQuarter={setQuarter} setFit={setFit} researchContact={researchContact} addTasks={addTasks} startSearch={startSearch} navigateContact={() => navigate("contact")} /> : <ContactPage state={state} setQuarter={setQuarter} updateTask={updateTask} updateTasks={updateTasks} navigateSourcing={() => navigate("sourcing")} notify={notify} />}
    </div>{toast && <div className="lu-toast" role="status">{toast}</div>}
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
