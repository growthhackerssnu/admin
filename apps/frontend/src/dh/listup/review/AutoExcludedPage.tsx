import "@/design-system/workspace.css";
import "@/design-system/globals.css";
import "./operations.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { AutoExcludedCandidate, LiveReviewRepository } from "./liveRepository";

// 학회와 맞지 않는 도메인으로 자동 제외된 기업을 분야별로 모아 보고, 필요하면 검토 목록으로 복원한다.
export function AutoExcludedPage({ repository }: { repository: LiveReviewRepository }) {
  const [rows, setRows] = useState<AutoExcludedCandidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const reload = useCallback(async () => {
    setError("");
    setRows(await repository.loadAutoExcluded());
  }, [repository]);
  useEffect(() => {
    void reload().catch((failure) => setError(failure instanceof Error ? failure.message : "자동 제외 목록을 불러오지 못했습니다."));
  }, [reload]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byCategory = new Map<string, AutoExcludedCandidate[]>();
    for (const row of rows ?? []) {
      if (needle && !`${row.name} ${row.summary}`.toLowerCase().includes(needle)) continue;
      byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);
    }
    return [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows, query]);

  const restore = async (row: AutoExcludedCandidate) => {
    setBusyId(row.id);
    setError("");
    try {
      await repository.restoreAutoExcluded(row.id);
      setRows((current) => current?.filter((item) => item.id !== row.id) ?? null);
      setNotice(`${row.name}을(를) 검토 목록으로 복원했습니다.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "복원하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return <main className="ds-workspace uw-ops">
    <header className="uw-ops-head">
      <a href="/dh"><ArrowLeft size={16} /> 기업 검토</a>
      <Button variant="ghost" size="sm" disabled={rows === null} onClick={() => { setRows(null); void reload().catch((failure) => setError(failure instanceof Error ? failure.message : "새로고침에 실패했습니다.")); }}><RefreshCw size={15} /> 새로고침</Button>
    </header>
    <div className="uw-ops-body">
      <div className="uw-ops-intro"><p>대외협력 운영</p><h1>자동 제외된 기업</h1><span>TIPS 산업분류상 신약·반도체·소재 등 학회 프로젝트와 맞지 않는 도메인이라 검토 목록과 배정에서 뺀 기업입니다. 복원하면 다시 검토 대상이 되고, 다시 자동 제외되지 않습니다.</span></div>
      {error && <p className="uw-ops-error" role="alert">{error}</p>}
      {notice && <p className="uw-ops-notice" role="status">{notice}</p>}
      {rows === null ? <p className="uw-ops-loading" role="status"><Spinner /> 목록을 불러오는 중…</p> : <>
        <div className="uw-excluded-search">
          <Input aria-label="기업명·분야 검색" placeholder="기업명·분야 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          <span>총 {rows.length}개</span>
        </div>
        {!groups.length && <p className="uw-ops-notice">{rows.length ? "검색 결과가 없습니다." : "자동 제외된 기업이 없습니다."}</p>}
        {groups.map(([category, items]) => <section key={category} className="uw-ops-section" aria-label={category}>
          <div className="uw-ops-section-head"><div><h2>{category}</h2><p>{items.length}개</p></div></div>
          <ul className="uw-excluded-list">
            {items.map((row) => <li key={row.id}>
              <div>
                <strong>{row.name}</strong>
                <span>{row.summary}</span>
                <small>{[row.source, row.reason].filter(Boolean).join(" · ")}</small>
              </div>
              <Button variant="outline" size="sm" disabled={busyId !== null} onClick={() => void restore(row)}>
                {busyId === row.id && <Spinner />} 복원
              </Button>
            </li>)}
          </ul>
        </section>)}
      </>}
    </div>
  </main>;
}
