import { useEffect, useMemo, useRef, useState } from "react";
import type { Batch, Company, Fit, ListupState } from "./model";
import { canHandoff, fitLabel, quarterLabel, quarters } from "./model";

const sourceOptions: { key: string; available: boolean; reason?: string }[] = [
  { key: "Google", available: true },
  { key: "뉴스레터", available: true },
  { key: "혁신의 숲", available: false, reason: "계약 API 필요" },
];

function BatchCheckbox({
  label,
  eligible,
  selected,
  onToggle,
}: {
  label: string;
  eligible: Company[];
  selected: Set<string>;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const count = eligible.filter((company) => selected.has(company.id)).length;
  useEffect(() => {
    if (ref.current)
      ref.current.indeterminate = count > 0 && count < eligible.length;
  }, [count, eligible.length]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={`${label} 현재 결과 전체 선택`}
      disabled={!eligible.length}
      checked={eligible.length > 0 && count === eligible.length}
      onChange={onToggle}
    />
  );
}

function SearchDialog({
  quarter,
  onClose,
  onStart,
}: {
  quarter: string;
  onClose: () => void;
  onStart: (
    condition: string | null,
    sources: string[],
    limit: number,
    quarter: string,
  ) => void;
}) {
  const [condition, setCondition] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState(quarter);
  const [sources, setSources] = useState(["Google", "뉴스레터"]);
  const [limit, setLimit] = useState(10);
  function toggle(source: string) {
    setSources((items) =>
      items.includes(source)
        ? items.filter((item) => item !== source)
        : [...items, source],
    );
  }
  return (
    <div
      className="lu-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
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
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <p className="lu-muted">수주 분기와 이번 탐색 범위를 설정하세요.</p>
        <label className="lu-field">
          수주 분기
          <select
            value={selectedQuarter}
            onChange={(event) => setSelectedQuarter(event.target.value)}
          >
            {quarters.map((item) => (
              <option key={item} value={item}>
                {quarterLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="lu-field">
          관심 기업 조건 <span className="lu-muted">(선택)</span>
          <input
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            placeholder="예: 신규 서비스를 출시한 B2C 기업"
          />
        </label>
        <div className="lu-field">
          <strong>검색 소스</strong>
          <div className="lu-source-options">
            {sourceOptions.map((source) => (
              <label key={source.key}>
                <input
                  type="checkbox"
                  checked={sources.includes(source.key)}
                  disabled={!source.available}
                  onChange={() => toggle(source.key)}
                />{" "}
                {source.key}{source.reason ? ` (${source.reason})` : ""}
              </label>
            ))}
          </div>
        </div>
        <label className="lu-field">
          탐색 규모
          <input
            type="number"
            min={1}
            max={30}
            value={limit}
            onChange={(event) => setLimit(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
          />
        </label>
        <p className="lu-callout">
          샘플 데이터에서만 기업을 추가합니다. 실제 검색 API는 연결되지 않았고,
          같은 분기에서 이미 조사한 기업은 다시 넣지 않습니다.
        </p>
        <div className="lu-dialog-actions">
          <button onClick={onClose}>취소</button>
          <button
            className="lu-primary"
            disabled={!sources.length}
            onClick={() => {
              onStart(
                condition.trim() || null,
                sources,
                limit,
                selectedQuarter,
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

export function SourcingPage({
  state,
  setQuarter,
  setFit,
  researchContact,
  addTasks,
  startSearch,
  navigateContact,
}: {
  state: ListupState;
  setQuarter: (quarter: string) => void;
  setFit: (id: string, fit: Fit) => void;
  researchContact: (id: string) => void;
  addTasks: (ids: string[]) => void;
  startSearch: (
    condition: string | null,
    sources: string[],
    limit: number,
    quarter: string,
  ) => void;
  navigateContact: () => void;
}) {
  const [tab, setTab] = useState<Fit | "all">("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["initial"]));
  const batches = useMemo(
    () =>
      state.batches
        .filter((batch) => batch.quarter === state.quarter)
        .slice()
        .reverse(),
    [state.batches, state.quarter],
  );
  const ids = new Set(batches.flatMap((batch) => batch.companyIds));
  const companies = state.companies.filter((company) => ids.has(company.id));
  const added = new Set(
    state.tasks
      .filter((task) => task.quarter === state.quarter)
      .map((task) => task.companyId),
  );
  const detail = state.companies.find((company) => company.id === detailId);
  const fits = (company: Company) =>
    (tab === "all" || company.fit === tab) &&
    (!query ||
      `${company.name} ${company.service}`
        .toLowerCase()
        .includes(query.toLowerCase())) &&
    (contactFilter === "all" ||
      (contactFilter === "yes"
        ? company.people.length > 0
        : company.people.length === 0));
  const visible = companies.filter(fits);
  const eligible = visible.filter(
    (company) => canHandoff(company) && !added.has(company.id),
  );
  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleGroup(group: Company[]) {
    setSelected((current) => {
      const next = new Set(current);
      if (group.every((item) => next.has(item.id)))
        group.forEach((item) => next.delete(item.id));
      else group.forEach((item) => next.add(item.id));
      return next;
    });
  }
  function changeQuarter(quarter: string) {
    setQuarter(quarter);
    setSelected(new Set());
    setDetailId(null);
    setTab("all");
    setQuery("");
    setContactFilter("all");
  }
  return (
    <main className="lu-main">
      <div className="lu-page-title">
        <h1>기업 탐색</h1>
        <button className="lu-primary" onClick={() => setDialog(true)}>
          ＋ 새 탐색
        </button>
      </div>
      <div className="lu-quarter">
        <label htmlFor="lu-quarter">수주 분기</label>
        <select
          id="lu-quarter"
          value={state.quarter}
          onChange={(event) => changeQuarter(event.target.value)}
        >
          {quarters.map((quarter) => (
            <option key={quarter} value={quarter}>
              {quarterLabel(quarter)}
            </option>
          ))}
        </select>
        <span className="lu-quarter-meta">
          탐색 {batches.length}회 · 기업 {companies.length}개
        </span>
      </div>
      <section className="lu-surface">
        <div className="lu-tabs">
          {(["all", "fit", "pending", "unfit"] as const).map((value) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {value === "all" ? "전체" : fitLabel[value]}{" "}
              <span>
                {
                  companies.filter(
                    (company) => value === "all" || company.fit === value,
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
            placeholder="기업명 또는 서비스 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="연락 창구 필터"
            value={contactFilter}
            onChange={(event) => setContactFilter(event.target.value)}
          >
            <option value="all">모든 연락 상태</option>
            <option value="yes">창구 확보</option>
            <option value="no">창구 미확보</option>
          </select>
          <div className="lu-spacer" />
          <button
            onClick={() =>
              setExpanded(new Set(batches.map((batch) => batch.id)))
            }
          >
            전체 펼치기
          </button>
          <button onClick={() => setExpanded(new Set())}>전체 접기</button>
        </div>
        <div className="lu-bulk">
          <strong>{selected.size}개 선택</strong>
          <button
            disabled={!eligible.length}
            onClick={() => toggleGroup(eligible)}
          >
            현재 결과 전체 선택
          </button>
          <button
            className="lu-primary"
            disabled={!selected.size}
            onClick={() => {
              addTasks([...selected]);
              setSelected(new Set());
            }}
          >
            컨택 작업에 추가
          </button>
          <button className="lu-text-button" onClick={navigateContact}>
            컨택 작업 보기 →
          </button>
        </div>
        <div className="lu-batches">
          {batches.map((batch: Batch) => {
            const rows = batch.companyIds
              .map((id) => state.companies.find((item) => item.id === id))
              .filter((item): item is Company => !!item && fits(item));
            if (
              !rows.length &&
              (query || tab !== "all" || contactFilter !== "all")
            )
              return null;
            const selectable = rows.filter(
              (item) => canHandoff(item) && !added.has(item.id),
            );
            const counts = (["fit", "pending", "unfit"] as const)
              .map(
                (fit) =>
                  `${fitLabel[fit]} ${batch.companyIds.filter((id) => state.companies.find((company) => company.id === id)?.fit === fit).length}`,
              )
              .join(" · ");
            return (
              <section className="lu-batch" key={batch.id}>
                <button
                  className="lu-batch-head"
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
                  <span className="lu-chevron">
                    {expanded.has(batch.id) ? "▾" : "▸"}
                  </span>
                  <span>
                    <strong>{batch.condition || "조건 없이 탐색"}</strong>
                    <small>{batch.createdAt}</small>
                  </span>
                  <span className="lu-batch-count">{rows.length}개 기업</span>
                </button>
                {expanded.has(batch.id) && (
                  <>
                    <div className="lu-batch-meta">
                      {counts}
                      {batch.excludedCount
                        ? ` · 중복 ${batch.excludedCount}개 제외`
                        : ""}
                    </div>
                    {rows.length ? (
                      <div className="lu-table-scroll">
                        <table className="lu-table">
                          <colgroup>
                            <col style={{ width: 46 }} />
                            <col />
                            <col style={{ width: 175 }} />
                            <col style={{ width: 90 }} />
                            <col style={{ width: 135 }} />
                            <col style={{ width: 94 }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>
                                <BatchCheckbox
                                  label={batch.condition || "조건 없이 탐색"}
                                  eligible={selectable}
                                  selected={selected}
                                  onToggle={() => toggleGroup(selectable)}
                                />
                              </th>
                              <th>기업 / 서비스</th>
                              <th>개입 영역</th>
                              <th>fit 판단</th>
                              <th>연락 창구</th>
                              <th>컨택 작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((company) => (
                              <tr
                                key={company.id}
                                className={
                                  detailId === company.id ? "selected" : ""
                                }
                                onClick={() => setDetailId(company.id)}
                              >
                                <td
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {canHandoff(company) && (
                                    <input
                                      type="checkbox"
                                      aria-label={`${company.name} 컨택 작업 선택`}
                                      checked={selected.has(company.id)}
                                      disabled={added.has(company.id)}
                                      onChange={() => toggleOne(company.id)}
                                    />
                                  )}
                                </td>
                                <td>
                                  <strong>{company.name}</strong>
                                  <small>{company.service}</small>
                                </td>
                                <td>{company.area}</td>
                                <td>
                                  <span className={`lu-tag ${company.fit}`}>
                                    {fitLabel[company.fit]}
                                  </span>
                                </td>
                                <td
                                  className={
                                    company.people.length ? "" : "lu-muted"
                                  }
                                >
                                  {company.people.length
                                    ? "이메일 · LinkedIn"
                                    : company.fit === "fit"
                                      ? "창구 미확보"
                                      : "—"}
                                </td>
                                <td
                                  className={
                                    added.has(company.id)
                                      ? "lu-added"
                                      : "lu-muted"
                                  }
                                >
                                  {added.has(company.id) ? "추가됨" : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="lu-empty">새로 추가된 기업이 없어요.</div>
                    )}
                  </>
                )}
              </section>
            );
          })}
          {!batches.length && (
            <div className="lu-empty">이 분기의 첫 탐색을 시작해보세요.</div>
          )}
        </div>
        <div className="lu-list-footer">
          {visible.length}개 기업 / 분기 전체 {companies.length}개
        </div>
      </section>
      {detail && (
        <div
          className="lu-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailId(null);
          }}
        >
          <aside className="lu-drawer" aria-label={`${detail.name} 상세`}>
            <div className="lu-drawer-head">
              <span>기업 상세</span>
              <button
                className="lu-icon-button"
                aria-label="상세 닫기"
                onClick={() => setDetailId(null)}
              >
                ×
              </button>
            </div>
            <div className="lu-drawer-body">
              <h2>{detail.name}</h2>
              <p>{detail.about}</p>
              <div className="lu-section">
                <div className="lu-section-head">
                  <h3>fit 판단</h3>
                  <select
                    aria-label="fit 판단 변경"
                    value={detail.fit}
                    onChange={(event) =>
                      setFit(detail.id, event.target.value as Fit)
                    }
                  >
                    {(["fit", "pending", "unfit"] as const).map((fit) => (
                      <option key={fit} value={fit}>
                        {fitLabel[fit]}
                      </option>
                    ))}
                  </select>
                </div>
                <h4>{detail.area}</h4>
                <strong>개입 가능성</strong>
                <p>{detail.possibility}</p>
                <strong>개입 가치</strong>
                <p>{detail.value}</p>
                <div className="lu-callout">
                  확인할 사항 · 실제 우선순위와 데이터 접근, 실험 권한은 기업과
                  확인이 필요해요.
                </div>
                {detail.changedByUser && (
                  <div className="lu-muted">사람이 변경한 판단입니다.</div>
                )}
              </div>
              <div className="lu-section">
                <div className="lu-section-head">
                  <h3>연락 창구</h3>
                  <button
                    disabled={detail.fit !== "fit"}
                    onClick={() => researchContact(detail.id)}
                  >
                    추가 조사
                  </button>
                </div>
                {detail.people.length ? (
                  detail.people.map((person) => (
                    <div className="lu-person" key={person.id}>
                      <strong>{person.name}</strong>
                      <small>{person.role} · 재직 확인 예시</small>
                      <div className="lu-person-links">
                        {person.email && <span>이메일</span>}
                        {person.linkedin && <span>LinkedIn</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="lu-muted">확보한 연락 창구가 없어요.</p>
                )}
                {canHandoff(detail) && (
                  <button
                    className="lu-primary lu-wide"
                    disabled={added.has(detail.id)}
                    onClick={() => addTasks([detail.id])}
                  >
                    {added.has(detail.id)
                      ? "컨택 작업에 추가됨"
                      : "컨택 작업에 추가"}
                  </button>
                )}
              </div>
              <details className="lu-history">
                <summary>자료·탐색 이력</summary>
                <p>공식 사이트·서비스 소개 자료 (목업 예시)</p>
                <p>수주 분기 · {quarterLabel(state.quarter)}</p>
              </details>
            </div>
          </aside>
        </div>
      )}
      {dialog && (
        <SearchDialog
          quarter={state.quarter}
          onClose={() => setDialog(false)}
          onStart={startSearch}
        />
      )}
    </main>
  );
}
