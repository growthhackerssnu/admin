import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Handshake, Search, Plus, UserRound, UsersRound, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  NavigationMenu, NavigationMenuContent, NavigationMenuItem,
  NavigationMenuList, NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceIconButton } from "@/components/ui/workspace-icon-button";
import {
  researchLabels, reviewLabels, safeUrl, validRecipient,
  type Actor, type Candidate, type CandidateCommand, type Recipient,
} from "./contracts";
import "@/design-system/globals.css";
import "./unified-review.css";

type Change = (candidate: Candidate, command: CandidateCommand) => Promise<boolean>;
type StatusFilter = "all" | "ready" | "reviewing" | "approved" | "rejected" | "error";
type OwnerFilter = "mine" | "all";
const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체 상태" }, { value: "ready", label: "검토 필요" },
  { value: "reviewing", label: "검토 중" }, { value: "approved", label: "승인" },
  { value: "rejected", label: "거절" }, { value: "error", label: "조사 오류" },
];
const blankContact: Recipient = { name: "", title: "", channel: "linkedin", address: "" };
type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

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
  return <Badge variant="outline" className="uw-status" data-tone={tone}>{label}</Badge>;
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

function Filter({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState("");
  return (
    <NavigationMenu viewport={false} className="uw-filter" value={open} onValueChange={setOpen}>
      <NavigationMenuList><NavigationMenuItem value={label}>
        <NavigationMenuTrigger className="uw-filter-trigger" aria-label={label}>{options.find((option) => option.value === value)?.label ?? label}</NavigationMenuTrigger>
        <NavigationMenuContent className="uw-filter-content">
          {options.map((option) => <button type="button" key={option.value} aria-pressed={option.value === value} onClick={() => { onChange(option.value); setOpen(""); }}>
            {option.label}{option.value === value && <span aria-hidden="true">✓</span>}
          </button>)}
        </NavigationMenuContent>
      </NavigationMenuItem></NavigationMenuList>
    </NavigationMenu>
  );
}

function ContactWork({ candidate, actor, pending, change, onDirty }: { candidate: Candidate; actor: Actor; pending: boolean; change: Change; onDirty: (dirty: boolean) => void }) {
  const owned = candidate.owner?.id === actor.id;
  const [mode, setMode] = useState<"add" | "edit" | null>(null);
  const [contact, setContact] = useState<Recipient>(candidate.recipient ?? blankContact);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const saved = candidate.contacts ?? (candidate.recipient ? [candidate.recipient] : []);
  const dirty = (Boolean(mode) && JSON.stringify(contact) !== JSON.stringify(candidate.recipient ?? blankContact)) || Boolean(note.trim());
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    setContact(candidate.recipient ?? blankContact);
    setMode(null);
    setError("");
  }, [candidate.id]);
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
  const canAct = owned && candidate.researchStatus === "ready" && !pending;
  return (
    <section className="uw-focus" aria-label={`${candidate.name} 검토`}>
      <header className="uw-pane-head">
        <div className="uw-head-copy"><h1>{candidate.name}</h1><p>{candidate.summary}</p></div>
        {candidate.owner && !owned && <span className="uw-readonly">{candidate.owner.name} · 조회 전용</span>}
      </header>
      <div className="uw-focus-scroll">
        {candidate.researchStatus === "error" ? (
          <div className="uw-state-message" role="alert"><h2>조사 오류</h2><p>{candidate.error?.message}</p>
            {candidate.error?.retryable && owned && <Button variant="outline" disabled={pending} onClick={() => void change(candidate, { type: "retry" })}>다시 조사</Button>}</div>
        ) : candidate.researchStatus !== "ready" ? (
          <div className="uw-state-message" role="status"><Spinner /><p>{researchLabels[candidate.researchStatus]}</p></div>
        ) : (
          <div className="uw-contact-area">
            {(!decided || candidate.recipient) && <div className="uw-section-heading"><h2>연락할 관계자</h2>
              {!decided && owned && <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(candidate.name)}`} target="_blank" rel="noopener noreferrer">LinkedIn에서 찾기</a>}
            </div>}
            {saved.length > 1 && <div className="uw-contact-options" aria-label="저장된 관계자">
              {saved.map((item, index) => <button key={`${item.address}-${index}`} type="button" aria-pressed={candidate.recipient?.address === item.address}
                disabled={!canAct} onClick={() => void change(candidate, { type: "selectContact", index })}>{item.name}</button>)}
            </div>}
            {candidate.recipient && !editing && <div className="uw-contact-summary">
              <div><strong>{candidate.recipient.name}</strong><span>{candidate.recipient.title || "직함 미입력"} · {candidate.recipient.channel === "linkedin" ? "LinkedIn" : "이메일"}</span>
                {candidate.recipient.channel === "linkedin" && safeUrl(candidate.recipient.address) ? <a href={safeUrl(candidate.recipient.address)} target="_blank" rel="noopener noreferrer">프로필 열기</a> : <span>{candidate.recipient.address}</span>}</div>
              {canAct && <div className="uw-contact-actions"><Button variant="ghost" size="sm" onClick={() => { setContact(candidate.recipient!); setMode("edit"); }}>수정</Button>
                <Button variant="ghost" size="sm" onClick={() => { setContact(blankContact); setMode("add"); }}><Plus size={14} /> 추가</Button></div>}
            </div>}
            {!candidate.recipient && !editing && !decided && <Empty className="uw-contact-empty">
              <EmptyHeader><EmptyMedia variant="icon"><UserRound aria-hidden="true" /></EmptyMedia><EmptyTitle>관계자 정보 없음</EmptyTitle></EmptyHeader>
              {canAct && !decided && <EmptyContent><Button variant="outline" onClick={() => { setContact(blankContact); setMode("add"); }}><Plus size={14} />관계자 추가</Button></EmptyContent>}
            </Empty>}
            {editing && <FieldGroup className="uw-field-group">
              <div className="uw-field-row"><Field><FieldLabel htmlFor="uw-contact-name">이름</FieldLabel><Input id="uw-contact-name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="uw-contact-title">직함</FieldLabel><Input id="uw-contact-title" value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} /></Field></div>
              <div className="uw-field-row"><Field><FieldLabel htmlFor="uw-contact-channel">채널</FieldLabel><select id="uw-contact-channel" value={contact.channel} onChange={(e) => setContact({ ...contact, channel: e.target.value as Recipient["channel"], address: "" })}><option value="linkedin">LinkedIn</option><option value="email">이메일</option></select></Field>
                <Field><FieldLabel htmlFor="uw-contact-address">{contact.channel === "linkedin" ? "프로필 링크" : "이메일 주소"}</FieldLabel><Input id="uw-contact-address" type={contact.channel === "email" ? "email" : "url"} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} /></Field></div>
              {error && <FieldError>{error}</FieldError>}
              <div className="uw-form-actions"><Button variant="ghost" onClick={() => setMode(null)}>취소</Button>
                <Button onClick={() => void save()} disabled={pending}>{pending && <Spinner />}관계자 저장</Button></div>
            </FieldGroup>}
            {decided && <div className="uw-decision"><div className="uw-decision-row"><StatusBadge candidate={candidate} />
              {canAct && <Button variant="ghost" size="sm" onClick={() => void change(candidate, { type: "reopen" })}>판단 변경</Button>}</div>
              {candidate.decisions.at(-1)?.note && <p>{candidate.decisions.at(-1)?.note}</p>}</div>}
            {!decided && owned && <Field className="uw-note"><FieldLabel htmlFor="uw-decision-note">판단 메모 <small>선택</small></FieldLabel><textarea id="uw-decision-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>}
          </div>
        )}
      </div>
      {canAct && !decided && <footer className="uw-focus-footer">
        <Button variant="destructive" onClick={() => void decide("rejected_fit")}>fit 부적합</Button>
        <Button variant="outline" onClick={() => void decide("rejected_contact")}>연락처 없음</Button>
        <Button className="uw-approve" disabled={Boolean(mode) || !candidate.recipient} onClick={() => void decide("approved")}>{pending && <Spinner />}승인</Button>
      </footer>}
    </section>
  );
}

function Details({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  return <aside className="uw-details" aria-label="기업 정보">
    <header className="uw-pane-head"><h2>기업 정보</h2><WorkspaceIconButton icon="close" label="기업 정보 닫기" onClick={onClose} /></header>
    <div className="uw-details-scroll">
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

export function UnifiedReviewPanel({ candidates, actor, canManageOps, owner, onOwnerChange, selectedId, pending, error, change, onDirty, onSelect, onMessage }: {
  candidates: Candidate[];
  actor: Actor;
  canManageOps: boolean;
  owner: OwnerFilter;
  onOwnerChange: (value: OwnerFilter) => void;
  selectedId: string | null;
  pending: boolean;
  error: string;
  change: Change;
  onDirty: (dirty: boolean) => void;
  onSelect: (id: string) => void;
  onMessage: (id: string) => void;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [compact, setCompact] = useState(() => matchMedia("(max-width: 900px)").matches);
  const [queueOpen, setQueueOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(() => !matchMedia("(max-width: 900px)").matches);
  const [dirty, setDirty] = useState(false);
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
  return <SidebarProvider defaultOpen className="uw-shell">
    <Sidebar collapsible="icon" className="uw-rail"><SidebarHeader><div className="uw-brand"><span className="uw-mark">GH</span><span className="uw-brand-name">Growth Hackers</span></div></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupLabel>워크스페이스</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild tooltip="그핵드인"><a href="/hr"><UsersRound /><span>그핵드인</span></a></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild tooltip="NUT"><a href="/nut"><Wallet /><span>NUT</span></a></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild isActive tooltip="대협"><a href="/dh"><Handshake /><span>대협</span></a></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroupContent></SidebarGroup>
      {canManageOps && <SidebarGroup><SidebarGroupLabel>대외협력 운영</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild tooltip="검토 큐와 배정"><a href="/dh?view=operations"><ClipboardList /><span>검토 큐와 배정</span></a></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroupContent></SidebarGroup>}
      </SidebarContent>
    </Sidebar>
    <SidebarInset className="uw-inset">
      {error && <div className="uw-error" role="alert">{error}</div>}
      <ResizablePanelGroup orientation="horizontal" className="uw-panels">
        {queueOpen && <><ResizablePanel defaultSize={compact ? "100%" : "24%"} minSize={compact ? "100%" : "17%"} maxSize={compact ? "100%" : "38%"}>
          <aside className="uw-queue" aria-label="기업 목록">
            <header className="uw-pane-head uw-queue-head"><RailToggle />{compact && <WorkspaceIconButton icon="close" label="목록 닫기" onClick={() => setQueueOpen(false)} />}</header>
            <div className="uw-queue-tools"><div className="uw-filter-row"><div className="uw-filter-leading"><WorkspaceIconButton className="uw-search-toggle" icon={searchOpen ? "close" : "search"} label={searchOpen ? "검색 닫기" : "검색 열기"} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }} /><span>{visible.length}건</span></div><div className="uw-filter-actions">
              <Filter label="담당 필터" value={owner} options={[{ value: "mine", label: "내 담당" }, { value: "all", label: "전체 담당" }]} onChange={(value) => onOwnerChange(value as OwnerFilter)} />
              <Filter label="상태 필터" value={status} options={statusOptions} onChange={(value) => setStatus(value as StatusFilter)} />
            </div></div>
              {searchOpen && <InputGroup className="uw-search"><InputGroupAddon><Search size={15} /></InputGroupAddon><InputGroupInput autoFocus aria-label="기업명 또는 설명 검색" placeholder="기업명 또는 설명 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></InputGroup>}</div>
            <div className="uw-items">{visible.map((candidate) => <button className="uw-item" type="button" key={candidate.id} aria-current={focused?.id === candidate.id} onClick={() => { onSelect(candidate.id); if (compact) setQueueOpen(false); }}>
              <span className="uw-item-head"><strong>{candidate.name}</strong><StatusBadge candidate={candidate} /></span>
              <span className="uw-item-meta"><span className="uw-item-summary" title={candidate.summary}>{candidate.summary}</span>
                {owner === "all" && <small className="uw-item-owner">{candidate.owner?.name ?? "미배정"}</small>}</span></button>)}
              {!visible.length && <p className="uw-empty">{candidates.length === 0
                ? "아직 수집된 기업이 없습니다. 수집·조사가 완료되면 이 목록에 표시됩니다."
                : owner === "mine"
                  ? "내게 배정된 기업이 없습니다. 전체 담당 필터에서 다른 기업을 볼 수 있습니다."
                  : "조건에 맞는 기업이 없습니다."}</p>}</div>
          </aside></ResizablePanel>{!compact && <ResizableHandle withHandle className="uw-handle" />}</>}
        {(!compact || !queueOpen) && <ResizablePanel defaultSize={compact ? "100%" : detailsOpen ? (queueOpen ? "52%" : "72%") : "100%"} minSize={compact ? "100%" : "34%"}>
          <div className={`uw-center ${!queueOpen ? "uw-center-with-menu" : ""} ${focused?.reviewStatus === "approved" ? "uw-message-ready" : ""}`}>{!queueOpen && <div className="uw-center-menu"><RailToggle /></div>}{focused ? <ContactWork key={focused.id} candidate={focused} actor={actor} pending={pending} change={change} onDirty={reportDirty} /> : <div className="uw-empty-main">기업을 선택하세요.</div>}
            <div className="uw-pane-controls"><WorkspaceIconButton icon={queueOpen ? "leftClose" : "leftOpen"} label={queueOpen ? "목록 닫기" : "목록 열기"} onClick={() => setQueueOpen(!queueOpen)} />
              {!compact && <WorkspaceIconButton icon={detailsOpen ? "rightClose" : "rightOpen"} label={detailsOpen ? "기업 정보 닫기" : "기업 정보 열기"} onClick={() => setDetailsOpen(!detailsOpen)} />}
              {focused?.reviewStatus === "approved" && <Button size="sm" variant="outline" onClick={() => onMessage(focused.id)}>메시지 열기</Button>}</div>
          </div>
        </ResizablePanel>}
        {detailsOpen && !compact && <><ResizableHandle withHandle className="uw-handle" /><ResizablePanel defaultSize="24%" minSize="18%" maxSize="38%">{focused ? <Details candidate={focused} onClose={() => setDetailsOpen(false)} /> : <aside className="uw-details" />}</ResizablePanel></>}
      </ResizablePanelGroup>
    </SidebarInset>
  </SidebarProvider>;
}

export function UnifiedReviewLoading() {
  return <main className="uw-loading" role="status" aria-label="연락 업무 불러오는 중">
    <div className="uw-loading-rail"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /></div>
    <div className="uw-loading-list"><Skeleton className="h-8 w-28" />{Array.from({ length: 6 }, (_, i) => <Skeleton className="h-16 w-full" key={i} />)}</div>
    <div className="uw-loading-main"><Skeleton className="h-9 w-48" /><Skeleton className="h-5 w-72" /><Skeleton className="mt-10 h-44 w-full" /></div>
    <div className="uw-loading-details"><Skeleton className="h-8 w-28" />{Array.from({ length: 4 }, (_, i) => <Skeleton className="h-14 w-full" key={i} />)}</div>
  </main>;
}
