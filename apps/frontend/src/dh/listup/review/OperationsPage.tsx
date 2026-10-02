import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type {
  AssignmentInput,
  AssignmentMember,
  AssignmentPreview,
  LiveReviewRepository,
  OperationsSummary,
} from "./liveRepository";
import "@/design-system/globals.css";
import "./operations.css";

const dateText = (offsetDays: number) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};

export function OperationsPage({ repository }: { repository: LiveReviewRepository }) {
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [members, setMembers] = useState<AssignmentMember[]>([]);
  const [input, setInput] = useState<AssignmentInput>({
    workStartsOn: dateText(0), workEndsOn: dateText(7), memberIds: [], perMemberCount: 1,
  });
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const confirmKey = useRef<string | null>(null);
  const intakeKey = useRef<string | null>(null);
  const reload = useCallback(async () => {
    const result = await repository.loadOperations();
    setSummary(result.summary);
    setMembers(result.members);
  }, [repository]);
  useEffect(() => {
    void reload().catch((failure) => setError(failure instanceof Error ? failure.message : "운영 현황을 불러오지 못했습니다."));
  }, [reload]);
  const changeInput = (next: AssignmentInput) => {
    setInput(next);
    setPreview(null);
    confirmKey.current = null;
    setNotice("");
    setError("");
  };
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "요청에 실패했습니다."); }
    finally { setBusy(false); }
  };
  const names = new Map(members.map((member) => [member.id, member.name]));
  const requestedCount = input.memberIds.length * input.perMemberCount;
  const insufficientQueue = Boolean(summary && requestedCount > summary.assignable);

  return <main className="uw-ops">
    <header className="uw-ops-head">
      <a href="/dh"><ArrowLeft size={16} /> 기업 검토</a>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(reload)}><RefreshCw size={15} /> 새로고침</Button>
    </header>
    <div className="uw-ops-body">
      <div className="uw-ops-intro"><p>대외협력 운영</p><h1>검토 큐와 배정</h1><span>조사가 끝난 기업 중 현재 배정 가능한 건을 확인하고, 이번 작업량을 확정합니다.</span></div>
      {error && <p className="uw-ops-error" role="alert">{error}</p>}
      {notice && <p className="uw-ops-notice" role="status">{notice}</p>}
      {!summary ? <p role="status">운영 현황을 불러오는 중…</p> : !summary.canManage ?
        <p role="alert">팀장 또는 관리자만 배정과 수집 상태를 변경할 수 있습니다.</p> : <>
        <section className="uw-ops-section" aria-labelledby="uw-ops-queue-title">
          <div className="uw-ops-section-head"><div><h2 id="uw-ops-queue-title">현재 검토 큐</h2><p>배정 가능한 기업만 회차에 포함됩니다.</p></div></div>
          <div className="uw-ops-metrics">
            <div><strong>{summary.assignable}</strong><span>배정 가능</span></div>
            <div><strong>{summary.researching}</strong><span>조사 대기·진행</span></div>
            <div><strong>{summary.researchError}</strong><span>조사 오류</span></div>
            <div><strong>{summary.assigned}</strong><span>이미 배정됨</span></div>
          </div>
        </section>
        <section className="uw-ops-section" aria-labelledby="uw-ops-intake-title">
          <div className="uw-ops-section-head"><div><h2 id="uw-ops-intake-title">새 기업 유입</h2><p>일시정지는 새 수집에 적용됩니다. 이미 쌓인 후보와 진행 중인 조사는 유지됩니다.</p></div>
            <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
              if (!summary) return;
              intakeKey.current ??= crypto.randomUUID();
              await repository.setIntake(!summary.intakePaused, summary.intakeVersion, intakeKey.current);
              intakeKey.current = null;
              await reload();
              setNotice(summary.intakePaused ? "새 기업 유입을 재개했습니다." : "새 기업 유입을 일시정지했습니다.");
            })}>{summary.intakePaused ? "유입 재개" : "유입 일시정지"}</Button>
          </div>
          <p className="uw-ops-inline-status">{summary.intakePaused ? "일시정지됨" : summary.pipelineEnabled ? "자동 수집 운영 중" : "자동 수집 대기 · 서버 일정이 활성화되면 시작"}</p>
        </section>
        <section className="uw-ops-section" aria-labelledby="uw-ops-batch-title">
          <div className="uw-ops-section-head"><div><h2 id="uw-ops-batch-title">새 배정 회차</h2><p>현재 큐에서 지정한 수만 고정합니다. 이후 들어오는 기업은 이 회차에 더하지 않습니다.</p></div></div>
          <div className="uw-ops-fields">
            <label>작업 시작일<Input type="date" value={input.workStartsOn} disabled={busy} onChange={(event) => changeInput({ ...input, workStartsOn: event.target.value })} /></label>
            <label>작업 종료일<Input type="date" value={input.workEndsOn} disabled={busy} onChange={(event) => changeInput({ ...input, workEndsOn: event.target.value })} /></label>
            <label>팀원당 기업 수<Input type="number" min={1} max={100} value={input.perMemberCount} disabled={busy} onChange={(event) => changeInput({ ...input, perMemberCount: Number(event.target.value) })} /></label>
          </div>
          <fieldset className="uw-ops-members"><legend>배정할 팀원</legend>
            {members.length ? members.map((member) => <label key={member.id}><input type="checkbox" checked={input.memberIds.includes(member.id)} disabled={busy}
              onChange={(event) => changeInput({ ...input, memberIds: event.target.checked
                ? [...input.memberIds, member.id] : input.memberIds.filter((id) => id !== member.id) })} />{member.name}</label>) : <p>배정 가능한 대외협력 팀원이 없습니다.</p>}
          </fieldset>
          <div className="uw-ops-actions"><span>{insufficientQueue ? `배정 가능 ${summary?.assignable}건 · 요청 ${requestedCount}건` : `총 ${requestedCount}건 배정`}</span>
            <Button disabled={busy || !input.memberIds.length || !input.workStartsOn || !input.workEndsOn || input.perMemberCount < 1 || insufficientQueue}
              onClick={() => void act(async () => { const result = await repository.previewAssignment(input); setPreview(result); confirmKey.current = crypto.randomUUID(); })}>
              {busy && <Spinner />} 배정 미리보기
            </Button></div>
        </section>
        {preview && <section className="uw-ops-section" aria-labelledby="uw-ops-preview-title">
          <div className="uw-ops-section-head"><div><h2 id="uw-ops-preview-title">배정 미리보기</h2><p>현재 배정 가능 {preview.eligibleCount}건 중 {preview.selectedCount}건을 선택했습니다.</p></div></div>
          <div className="uw-ops-preview-list">{preview.items.map((item) => <div key={item.candidateId}><span>{item.companyName}</span><strong>{names.get(item.memberId) ?? "팀원"}</strong></div>)}</div>
          <div className="uw-ops-actions"><span>{preview.workStartsOn} ~ {preview.workEndsOn}</span>
            <Button disabled={busy} onClick={() => {
              if (!window.confirm(`${preview.selectedCount}개 기업을 ${input.memberIds.length}명에게 고정 배정할까요?`)) return;
              void act(async () => {
                confirmKey.current ??= crypto.randomUUID();
                await repository.confirmAssignment(preview, confirmKey.current);
                confirmKey.current = null;
                setPreview(null);
                await reload();
                setNotice(`${preview.selectedCount}건을 배정했습니다.`);
              });
            }}>{busy && <Spinner />} 이 회차 확정</Button></div>
        </section>}
      </>}
    </div>
  </main>;
}
