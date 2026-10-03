import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, UserRound } from "lucide-react";
import { WorkspaceStatus, type WorkspaceTone } from "@/components/ui/workspace-status";
import { WorkspaceSidebar } from "@/components/ui/workspace-sidebar";
import { DhWorkspaceNavigation } from "./DhWorkspaceNavigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAlignedScroll } from "@/design-system/use-aligned-scroll";
import "@/design-system/workspace.css";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ListFilter } from "@/components/ui/list-filter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceIconButton } from "@/components/ui/workspace-icon-button";
import {
  researchLabels, reviewLabels, safeUrl, validRecipient,
  type AcquisitionRound, type Actor, type Candidate, type CandidateCommand, type Recipient,
} from "./contracts";
import "@/design-system/globals.css";
import "./unified-review.css";
import { MessageComposer } from "./MessageComposer";
import type { HistoryTab } from "./historyNavigation";
import { useConfirmation } from "@/components/ui/confirmation-dialog";

type Change = (candidate: Candidate, command: CandidateCommand) => Promise<boolean>;
type StatusFilter = "all" | "ready" | "reviewing" | "approved" | "rejected" | "error";
type OwnerFilter = "mine" | "all";
const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체 상태" }, { value: "ready", label: "검토 필요" },
  { value: "reviewing", label: "검토 중" }, { value: "approved", label: "승인" },
  { value: "rejected", label: "거절" }, { value: "error", label: "조사 오류" },
];
const blankContact: Recipient = { name: "", title: "", channel: "linkedin", address: "" };
type StatusTone = WorkspaceTone;

function candidateStatus(candidate: Candidate): { label: string; tone: StatusTone } {
  if (candidate.researchStatus === "error") return { label: "조사 오류", tone: "danger" };
  if (candidate.researchStatus !== "ready") return { label: researchLabels[candidate.researchStatus], tone: "info" };
  switch (candidate.reviewStatus) {
    case "approved": return { label: reviewLabels.approved, tone: "success" };
    case "rejected_fit": return { label: reviewLabels.rejected_fit, tone: "danger" };
    case "rejected_contact": return { label: reviewLabels.rejected_contact, tone: "warning" };
    case "reviewing": return { label: reviewLabels.reviewing, tone: "info" };
    default: return { label: "검토 필요", tone: "neutral" };
  }
}

function StatusBadge({ candidate }: { candidate: Candidate }) {
  const { label, tone } = candidateStatus(candidate);
  return <WorkspaceStatus tone={tone}>{label}</WorkspaceStatus>;
}

function statusOf(candidate: Candidate): StatusFilter {
  if (candidate.researchStatus === "error") return "error";
  if (candidate.reviewStatus === "rejected_fit" || candidate.reviewStatus === "rejected_contact") return "rejected";
  if (candidate.reviewStatus === "approved") return "approved";
  if (candidate.reviewStatus === "reviewing") return "reviewing";
  return "ready";
}

function RailToggle() {
  const { toggleSidebar } = useSidebar();
  return <WorkspaceIconButton icon="menu" label="주 메뉴 열기 또는 닫기" onClick={toggleSidebar} />;
}

function ContactWork({ candidate, actor, pending, change, onDirty, currentRound, roundError, retryRound, canManageOps }: { candidate: Candidate; actor: Actor; pending: boolean; change: Change; onDirty: (dirty: boolean) => void; currentRound?: AcquisitionRound | null; roundError?: string; retryRound?: () => void; canManageOps?: boolean }) {
  const scrollRef = useAlignedScroll(".uw-center");
  const owned = candidate.owner?.id === actor.id;
  const [mode, setMode] = useState<"add" | "edit" | null>(null);
  const [contact, setContact] = useState<Recipient>(candidate.recipient ?? blankContact);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [messageDirty, setMessageDirty] = useState(false);
  const trackMessageDirty = useCallback((value: boolean) => setMessageDirty(value), []);
  const saved = candidate.contacts ?? (candidate.recipient ? [candidate.recipient] : []);
  const dirty = (Boolean(mode) && JSON.stringify(contact) !== JSON.stringify(candidate.recipient ?? blankContact)) || Boolean(note.trim()) || messageDirty;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    setContact(candidate.recipient ?? blankContact);
    setMode(null);
    setError("");
  }, [candidate.id]);
  useEffect(() => { if (mode) document.getElementById("uw-contact-name")?.focus(); }, [mode]);
  const editing = Boolean(mode) && owned && candidate.researchStatus === "ready";
  const save = async () => {
    if (!validRecipient(contact)) {
      setError(contact.channel === "linkedin" ? "이름과 LinkedIn 개인 프로필 주소를 확인해주세요." : "이름과 이메일 주소를 확인해주세요.");
      return;
    }
    if (await change(candidate, { type: "contact", recipient: contact, mode: mode ?? "edit" })) {
      setMode(null);
      setError("");
    }
  };
  const decide = async (status: "approved" | "rejected_fit" | "rejected_contact") => {
    if (await change(candidate, { type: "decide", status, note })) setNote("");
  };
  const decided = ["approved", "rejected_fit", "rejected_contact"].includes(candidate.reviewStatus);
  const canAct = owned && candidate.researchStatus === "ready" && !pending && !messageDirty && candidate.canEditMessage !== false;
  const messageMode = candidate.reviewStatus === "approved" || candidate.sent.length > 0;
  const contactControls = <div className={messageMode ? "uw-message-recipient" : undefined}>
            {(!decided || candidate.recipient) && <div className="uw-section-heading"><h2>{messageMode ? "수신자" : "연락할 관계자"}</h2>
              {!decided && owned && <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(candidate.name)}`} target="_blank" rel="noopener noreferrer">LinkedIn에서 찾기</a>}
            </div>}
            {saved.length > 1 && <div className="uw-contact-options" aria-label="저장된 관계자">
              {saved.map((item, index) => <Button variant="outline" size="xs" key={`${item.address}-${index}`} type="button" aria-pressed={candidate.recipient?.address === item.address}
                disabled={!canAct} onClick={() => void change(candidate, { type: "selectContact", index })}>{item.name}</Button>)}
            </div>}
            {candidate.recipient && !editing && <div className="uw-contact-summary">
              <div><strong>{candidate.recipient.name}</strong><span>{candidate.recipient.title || "직함 미입력"} · {candidate.recipient.channel === "linkedin" ? "LinkedIn" : "이메일"}</span>
                {candidate.recipient.channel === "linkedin" && safeUrl(candidate.recipient.address) ? <a href={safeUrl(candidate.recipient.address)} target="_blank" rel="noopener noreferrer">프로필 열기</a> : <span>{candidate.recipient.address}</span>}</div>
              {owned && !candidate.sent.length && <div className="uw-contact-actions"><Button disabled={!canAct} variant="ghost" size="sm" onClick={() => { setContact(candidate.recipient!); setMode("edit"); }}>수정</Button>
                <Button disabled={!canAct} variant="ghost" size="sm" onClick={() => { setContact(blankContact); setMode("add"); }}><Plus size={14} /> 추가</Button></div>}
            </div>}
            {!candidate.recipient && !editing && !decided && <Empty className="uw-contact-empty">
              <EmptyHeader><EmptyMedia variant="icon"><UserRound aria-hidden="true" /></EmptyMedia><EmptyTitle>관계자 정보 없음</EmptyTitle></EmptyHeader>
              {canAct && !decided && <EmptyContent><Button variant="outline" onClick={() => { setContact(blankContact); setMode("add"); }}><Plus size={14} />관계자 추가</Button></EmptyContent>}
            </Empty>}
            {editing && <FieldGroup className="uw-field-group">
              <div className="uw-field-row"><Field><FieldLabel htmlFor="uw-contact-name" required>이름</FieldLabel><Input id="uw-contact-name" aria-invalid={Boolean(error) && !contact.name.trim()} aria-describedby={error ? "uw-contact-error" : undefined} aria-required="true" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="uw-contact-title">직함</FieldLabel><Input id="uw-contact-title" value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} /></Field></div>
              <div className="uw-field-row"><Field><FieldLabel htmlFor="uw-contact-channel">채널</FieldLabel><Select value={contact.channel} onValueChange={value => setContact({ ...contact, channel: value as Recipient["channel"], address: "" })}><SelectTrigger id="uw-contact-channel"><SelectValue /></SelectTrigger><SelectContent position="popper" className="dw-select-content"><SelectItem value="linkedin">LinkedIn</SelectItem><SelectItem value="email">이메일</SelectItem></SelectContent></Select></Field>
                <Field><FieldLabel htmlFor="uw-contact-address" required>{contact.channel === "linkedin" ? "프로필 링크" : "이메일 주소"}</FieldLabel><Input id="uw-contact-address" aria-invalid={Boolean(error) && !validRecipient({ ...contact, name: "check" })} aria-describedby={error ? "uw-contact-error" : undefined} aria-required="true" type={contact.channel === "email" ? "email" : "url"} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} /></Field></div>
              {error && <FieldError id="uw-contact-error">{error}</FieldError>}
              <div className="uw-form-actions"><Button variant="ghost" onClick={() => setMode(null)}>취소</Button>
                <Button onClick={() => void save()} disabled={pending}>{pending && <Spinner />}관계자 저장</Button></div>
            </FieldGroup>}
  </div>;
  return (
    <section className="uw-focus" aria-label={`${candidate.name} 검토`}>
      <header className="uw-pane-head">
        <div className="uw-head-copy"><h1>{candidate.name}</h1><p>{candidate.summary}</p></div>
        {candidate.owner && !owned && <span className="uw-readonly">{candidate.owner.name} · 조회 전용</span>}
      </header>
      {messageMode ? <MessageComposer candidate={candidate} actor={actor} currentRound={currentRound} roundError={roundError} retryRound={retryRound} canManageOps={canManageOps} change={change} pending={pending || Boolean(mode)}
        onDirty={trackMessageDirty} recipientControls={contactControls}
        onReopen={owned && !candidate.sent.length ? () => void change(candidate, { type: "reopen" }) : undefined} /> : <>
      <div ref={scrollRef} className="uw-focus-scroll">
        {candidate.researchStatus === "error" ? (
          <div className="uw-state-message" role="alert"><h2>조사 오류</h2><p>{candidate.error?.message}</p>
            {candidate.error?.retryable && owned && <Button variant="outline" disabled={pending} onClick={() => void change(candidate, { type: "retry" })}>다시 조사</Button>}</div>
        ) : candidate.researchStatus !== "ready" ? (
          <div className="uw-state-message" role="status"><Spinner /><p>{researchLabels[candidate.researchStatus]}</p></div>
        ) : (
          <div className="uw-contact-area">
            {contactControls}
            {decided && <div className="uw-decision"><div className="uw-decision-row"><StatusBadge candidate={candidate} />
              {canAct && <Button variant="ghost" size="sm" onClick={() => void change(candidate, { type: "reopen" })}>판단 변경</Button>}</div>
              {candidate.decisions.at(-1)?.note && <p>{candidate.decisions.at(-1)?.note}</p>}</div>}
            {!decided && owned && <Field className="uw-note"><FieldLabel htmlFor="uw-decision-note">판단 메모 <small>선택</small></FieldLabel><Textarea id="uw-decision-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>}
          </div>
        )}
      </div>
      {owned && candidate.researchStatus === "ready" && !decided && <footer className="uw-focus-footer">
        <Button variant="destructive" disabled={pending} onClick={() => void decide("rejected_fit")}>fit 부적합</Button>
        <Button variant="outline" disabled={pending} onClick={() => void decide("rejected_contact")}>연락처 없음</Button>
        <Button className="uw-approve" disabled={pending || Boolean(mode) || !candidate.recipient} onClick={() => void decide("approved")}>{pending && <Spinner />}승인</Button>
      </footer>}
      </>}
    </section>
  );
}

function Details({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const scrollRef = useAlignedScroll();
  return <aside className="uw-details" aria-label="기업 정보">
    <header className="uw-pane-head"><h2>기업 정보</h2><WorkspaceIconButton icon="close" label="기업 정보 닫기" onClick={onClose} /></header>
    <div ref={scrollRef} className="uw-details-scroll">
      {candidate.research && <><section><h3>기업 조사</h3>{candidate.research.facts.map((fact) => <div className="uw-fact" key={fact.title}><small>{fact.title}</small><p>{fact.text}</p></div>)}
        {candidate.research.ideas.length > 0 && <div className="uw-fact"><small>협업 아이디어</small>{candidate.research.ideas.map((idea) => <p key={idea.title}>{idea.title}</p>)}</div>}</section>
        <section><h3>출처</h3>{candidate.research.evidence.map((source) => <a key={source.id} href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</section></>}
      {candidate.recipient && <section><h3>관계자</h3><strong>{candidate.recipient.name}</strong><p>{candidate.recipient.title || "직함 미입력"}</p><small>{candidate.recipient.channel === "linkedin" ? "LinkedIn" : "이메일"}</small>
        {candidate.recipient.channel === "linkedin" ? <a href={safeUrl(candidate.recipient.address)} target="_blank" rel="noopener noreferrer">프로필 열기</a> : <p>{candidate.recipient.address}</p>}</section>}
      <section><h3>수집·조사 정보</h3><p>{candidate.source} · {new Date(candidate.discoveredAt).toLocaleDateString("ko-KR")}</p>
        {safeUrl(candidate.sourceUrl) && <a href={safeUrl(candidate.sourceUrl)} target="_blank" rel="noopener noreferrer">발견 원문</a>}</section>
    </div>
  </aside>;
}

export function UnifiedReviewPanel({ candidates, actor, canManageOps, owner, onOwnerChange, selectedId, pending, error, reload, reloading, change, onDirty, onSelect, currentRound, roundError, retryRound, onTabChange }: {
  candidates: Candidate[];
  actor: Actor;
  canManageOps: boolean;
  owner: OwnerFilter;
  onOwnerChange: (value: OwnerFilter) => void;
  selectedId: string | null;
  pending: boolean;
  error: string;
  reload?: () => void;
  reloading?: boolean;
  change: Change;
  onDirty: (dirty: boolean) => void;
  onSelect: (id: string) => void;
  currentRound?: AcquisitionRound | null;
  roundError?: string;
  retryRound?: () => void;
  onTabChange?: (tab: HistoryTab) => void | boolean | Promise<void | boolean>;
}) {
  const queueScrollRef = useAlignedScroll();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [compact, setCompact] = useState(() => matchMedia("(max-width: 900px)").matches);
  const [queueOpen, setQueueOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(() => !matchMedia("(max-width: 900px)").matches);
  const [dirty, setDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const { confirm, dialog } = useConfirmation();
  useEffect(() => { if (compact && detailsOpen) document.querySelector<HTMLButtonElement>(".uw-mobile-details button")?.focus(); }, [compact, detailsOpen]);
  const reportDirty = useCallback((value: boolean) => { setDirty(value); onDirty(value); }, [onDirty]);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const update = (event: MediaQueryListEvent) => { setCompact(event.matches); setQueueOpen(!event.matches); setDetailsOpen(!event.matches); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const visible = useMemo(() => candidates.filter((candidate) =>
    (owner === "all" || candidate.owner?.id === actor.id) &&
    (status === "all" || statusOf(candidate) === status) &&
    `${candidate.name} ${candidate.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  ), [candidates, actor.id, owner, status, query]);
  useEffect(() => { if (!selectedId && visible[0]) onSelect(visible[0].id); }, [selectedId, visible, onSelect]);
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId);
  const focused = visible.find((candidate) => candidate.id === selectedId) ?? (dirty ? selectedCandidate : undefined) ?? visible[0];
  const changeStatus = async (value: string) => {
    if (dirty && !await confirm("저장하지 않은 입력을 버리고 필터를 바꿀까요?", "저장하지 않은 입력", "버리고 변경")) return;
    if (dirty) setEditorEpoch(value => value + 1);
    reportDirty(false);
    setStatus(value as StatusFilter);
  };
  const queueContent = (
          <aside className="uw-queue" aria-label="기업 목록">
            <div className="uw-queue-tools"><div className="uw-filter-row"><div className="uw-filter-leading">{!onTabChange && <RailToggle />}<WorkspaceIconButton className="uw-search-toggle" icon={searchOpen ? "close" : "search"} label={searchOpen ? "검색 닫기" : "검색 열기"} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }} /><span>{visible.length}건</span></div><div className="uw-filter-actions">
              <ListFilter label="담당 필터" value={owner} options={[{ value: "mine", label: "내 담당" }, { value: "all", label: "전체 담당" }]} onChange={(value) => onOwnerChange(value as OwnerFilter)} />
              <ListFilter label="상태 필터" value={status} options={statusOptions} onChange={changeStatus} />
              {compact && <WorkspaceIconButton icon="close" label="목록 닫기" onClick={() => setQueueOpen(false)} />}
            </div></div>
              {searchOpen && <InputGroup className="uw-search"><InputGroupAddon><Search size={15} /></InputGroupAddon><InputGroupInput autoFocus aria-label="기업명 또는 설명 검색" placeholder="기업명 또는 설명 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></InputGroup>}</div>
            <div ref={queueScrollRef} className="uw-items">{visible.map((candidate) => <button className="uw-item" type="button" key={candidate.id} aria-current={focused?.id === candidate.id} onClick={() => { onSelect(candidate.id); if (compact) setQueueOpen(false); }}>
              <span className="uw-item-head"><strong>{candidate.name}</strong><StatusBadge candidate={candidate} /></span>
              <span className="uw-item-meta"><span className="uw-item-summary" title={candidate.summary}>{candidate.summary}</span>
                {owner === "all" && <small className="uw-item-owner">{candidate.owner?.name ?? "미배정"}</small>}</span></button>)}
              {!visible.length && <p className="uw-empty">{candidates.length === 0
                ? "아직 수집된 기업이 없습니다. 수집·조사가 완료되면 이 목록에 표시됩니다."
                : owner === "mine"
                  ? "내게 배정된 기업이 없습니다. 전체 담당 필터에서 다른 기업을 볼 수 있습니다."
                  : "조건에 맞는 기업이 없습니다."}</p>}</div>
          </aside>
  );
  return <SidebarProvider defaultOpen data-queue-open={queueOpen} className={`ds-workspace uw-shell${onTabChange ? " dw-section-workspace" : ""}`}>
    {dialog}
    {onTabChange ? <DhWorkspaceNavigation value="review" onChange={onTabChange} canManageOps={canManageOps} /> : <WorkspaceSidebar canManageOps={canManageOps} />}
    <SidebarInset className="uw-inset">
      {error && <div className={`uw-error${reload ? " uw-refresh-notice" : ""}`} role={reload ? "status" : "alert"}><span>{error}</span>{reload && <Button variant="outline" size="sm" disabled={reloading} onClick={reload}>다시 불러오기</Button>}</div>}
      <div className="uw-workspace-body">
        {queueOpen && !compact && <div className="uw-fixed-queue">{queueContent}</div>}
      <ResizablePanelGroup orientation="horizontal" className="uw-panels">
        {<ResizablePanel defaultSize={compact || !detailsOpen ? "100%" : "70%"} minSize={compact ? "100%" : "55%"}>
          <div aria-hidden={compact && (queueOpen || detailsOpen) ? true : undefined} {...(compact && (queueOpen || detailsOpen) ? { inert: "" } : {})} className={`uw-center ${!queueOpen && !onTabChange ? "uw-center-with-menu" : ""}`}>{!queueOpen && !onTabChange && <div className="uw-center-menu"><RailToggle /></div>}{focused ? <ContactWork key={`${focused.id}-${editorEpoch}`} candidate={focused} actor={actor} pending={pending} change={change} onDirty={reportDirty} currentRound={currentRound} roundError={roundError} retryRound={retryRound} canManageOps={canManageOps} /> : <div className="uw-empty-main">기업을 선택하세요.</div>}
            <div className="uw-pane-controls"><WorkspaceIconButton icon={queueOpen ? "leftClose" : "leftOpen"} label={queueOpen ? "목록 닫기" : "목록 열기"} onClick={() => { setQueueOpen(!queueOpen); if (compact) setDetailsOpen(false); }} />
              <WorkspaceIconButton icon={detailsOpen ? "rightClose" : "rightOpen"} label={detailsOpen ? "기업 정보 닫기" : "기업 정보 열기"} onClick={() => setDetailsOpen(!detailsOpen)} />
              </div>
          </div>
        </ResizablePanel>}
        {detailsOpen && !compact && <><ResizableHandle withHandle className="uw-handle" /><ResizablePanel defaultSize="30%" minSize="22%" maxSize="45%">{focused ? <Details candidate={focused} onClose={() => setDetailsOpen(false)} /> : <aside className="uw-details" />}</ResizablePanel></>}
      </ResizablePanelGroup>
      </div>
      {compact && queueOpen && <div className="uw-mobile-queue">{queueContent}</div>}
      {compact && detailsOpen && !queueOpen && focused && <div className="uw-mobile-details"><Details candidate={focused} onClose={() => setDetailsOpen(false)} /></div>}
    </SidebarInset>
  </SidebarProvider>;
}

export function UnifiedReviewLoading() {
  return <main className="ds-workspace uw-loading" role="status" aria-label="연락 업무 불러오는 중">
    <div className="uw-loading-rail"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /></div>
    <div className="uw-loading-list"><Skeleton className="h-8 w-28" />{Array.from({ length: 6 }, (_, i) => <Skeleton className="h-16 w-full" key={i} />)}</div>
    <div className="uw-loading-main"><Skeleton className="h-9 w-48" /><Skeleton className="h-5 w-72" /><Skeleton className="mt-10 h-44 w-full" /></div>
    <div className="uw-loading-details"><Skeleton className="h-8 w-28" />{Array.from({ length: 4 }, (_, i) => <Skeleton className="h-14 w-full" key={i} />)}</div>
  </main>;
}
