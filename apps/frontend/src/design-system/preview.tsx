import React from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ListFilter } from "@/components/ui/list-filter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceIconButton } from "@/components/ui/workspace-icon-button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Handshake, Search, UsersRound, Wallet } from "lucide-react";
import "./globals.css";
import "./preview.css";
import { LayoutDraft } from "./layout-draft";
import { SidebarBrand } from "@/components/ui/sidebar-brand";
import { BrandPreview } from "./brand-preview";
import { PaletteDraft } from "./palette-draft";

const brand = ["0", "100", "200", "300", "400", "500", "600", "700", "800", "900"].map(step => [step, `--ds-brand-${step}`]);
const neutrals = ["100", "200", "300", "400", "500", "600", "700", "800", "900"].map(step => [step, `--ds-gray-${step}`]);
const surfaces = [["목록 바탕", "--ds-surface-canvas"], ["작업·정보", "--ds-surface-details"], ["선택 행", "--ds-surface-selected"], ["선택 선", "--ds-surface-selected-border"]];
const semantic = [["Success · 진행/성공", "--ds-success"], ["Danger · 오류/정지", "--ds-danger"], ["Warning · 주의/알림", "--ds-warning"], ["Info · 정보/진행 중", "--ds-info"]];
const type = [
  ["headline 1", "96px", "ds-headline-1"], ["headline 2", "60px", "ds-headline-2"],
  ["headline 3", "48px", "ds-headline-3"], ["headline 4", "34px", "ds-headline-4"],
  ["headline 5", "24px", "ds-headline-5"], ["headline 6", "20px", "ds-headline-6"],
  ["body 1", "16px", "ds-body-1"], ["body 2", "14px", "ds-body-2"],
  ["subtitle 1", "16px", "ds-subtitle-1"], ["subtitle 2", "14px", "ds-subtitle-2"],
  ["button", "14px", "ds-button-text"], ["overline", "10px", "ds-overline"],
  ["caption", "12px", "ds-caption"],
];

function Palette({ title, items }: { title: string; items: string[][] }) {
  const [colors, setColors] = React.useState<Record<string, string>>({});
  React.useEffect(() => { const styles = getComputedStyle(document.documentElement); setColors(Object.fromEntries(items.map(([, token]) => [token, styles.getPropertyValue(token).trim().toUpperCase()]))); }, [items]);
  return <div className="ds-palette"><h3 className="ds-subtitle-1">{title}</h3><div className="ds-swatches">{items.map(([name, color]) => <div className="ds-swatch" key={name}><div className="ds-swatch-color" style={{ background: `var(${color})` }} /><div className="ds-caption">{name}</div><code>{colors[color]}</code></div>)}</div></div>;
}

function App() {
  const [ownerFilter, setOwnerFilter] = React.useState("mine");
  return <SidebarProvider className="ds-preview-layout">
    <Sidebar collapsible="icon" expandOnHover aria-label="워크스페이스 탐색">
      <SidebarBrand />
      <SidebarContent>
        <SidebarGroup><SidebarGroupLabel>워크스페이스</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton asChild tooltip="그핵드인"><a href="/hr"><UsersRound /><span>그핵드인</span></a></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton asChild tooltip="NUT"><a href="/nut"><Wallet /><span>NUT</span></a></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton asChild isActive tooltip="대협"><a href="/dh"><Handshake /><span>대협</span></a></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="ds-preview-sidebar-footer"><span>Sidebar · shadcn/ui</span></SidebarFooter>
    </Sidebar>
    <SidebarInset className="ds-preview-inset">
      <div className="ds-preview-toolbar"><SidebarTrigger aria-label="사이드 네비게이션 열기 또는 닫기" /><span>디자인 시스템</span><nav className="ds-preview-section-links"><a href="#brand-assets">로고</a><a href="#layout-draft">레이아웃 초안</a><a href="#palette-draft">색상 초안</a></nav></div>
      <div className="ds-preview">
    <header className="ds-preview-header">
      <div><p className="ds-overline">Growth Hackers / DH BOT</p><h1 className="ds-headline-4">디자인 시스템</h1><p className="ds-body-1">색상, 글씨 위계, shadcn/ui 기본 컴포넌트의 시작점</p></div>
      <Badge variant="outline">Foundation · v0</Badge>
    </header>
    <Separator />
    <BrandPreview />
    <Separator />
    <section><p className="ds-overline">01 / Color</p><h2 className="ds-headline-5">색상</h2><p className="ds-body-2 ds-muted">현재 검토 화면에 적용된 브랜드·중립·표면·상태 색상입니다.</p>
      <Palette title="Brand / Action · #01397C 기준" items={brand} /><Palette title="Neutral" items={neutrals} /><Palette title="Workspace surfaces" items={surfaces} /><Palette title="Semantic" items={semantic} />
    </section>
    <Separator />
    <section><p className="ds-overline">02 / Typography</p><h2 className="ds-headline-5">글씨 위계</h2><p className="ds-body-2 ds-muted">영문 Open Sans · 한글 Noto Sans KR. 아래 크기는 요청한 MDC 기준과 동일합니다.</p>
      <div className="ds-type-list">{type.map(([role, size, klass]) => <div className="ds-type-row" key={role}><div className="ds-type-meta"><span>{role}</span><span>{size}</span></div><div className={klass}>Review Workspace 검토 화면</div></div>)}</div>
    </section>
    <Separator />
    <section><p className="ds-overline">03 / Components</p><h2 className="ds-headline-5">기본 컴포넌트</h2><p className="ds-body-2 ds-muted">공식 shadcn/ui 생성 파일을 이 토큰에 연결했습니다.</p>
      <div className="ds-component-grid">
        <div className="ds-demo"><h3 className="ds-subtitle-2">Actions</h3><div className="ds-inline"><Button className="ds-approval">승인</Button><Button>기본 행동</Button><Button variant="secondary">보조 행동</Button><Button variant="outline">상세 보기</Button><Button variant="ghost">닫기</Button><Button variant="destructive">거절</Button></div></div>
        <div className="ds-demo"><h3 className="ds-subtitle-2">Status</h3><div className="ds-inline"><Badge>진행 중</Badge><Badge variant="secondary">대기</Badge><Badge variant="destructive">오류</Badge><Badge variant="outline">검토 완료</Badge></div></div>
        <div className="ds-demo"><h3 className="ds-subtitle-2">Input</h3><div className="ds-field"><Label htmlFor="company">기업명</Label><Input id="company" placeholder="기업명을 입력하세요" /></div><div className="ds-field"><Label htmlFor="note">검토 메모</Label><Textarea id="note" placeholder="조사 내용을 기록하세요" /></div></div>
        <div className="ds-demo"><h3 className="ds-subtitle-2">Select</h3><div className="ds-field"><Label htmlFor="status">상태</Label><Select><SelectTrigger id="status" className="w-full"><SelectValue placeholder="상태 선택" /></SelectTrigger><SelectContent><SelectItem value="pending">검토 전</SelectItem><SelectItem value="approved">승인</SelectItem><SelectItem value="rejected">거절</SelectItem></SelectContent></Select></div></div>
      </div>
    </section>
    <Separator />
    <section><p className="ds-overline">04 / Workspace</p><h2 className="ds-headline-5">연락 업무 구성 요소</h2>
      <div className="ds-component-grid">
        <div className="ds-demo"><h3 className="ds-subtitle-2">검색 · Input Group</h3><InputGroup><InputGroupAddon><Search size={16} /></InputGroupAddon><InputGroupInput aria-label="기업 검색 예시" placeholder="기업명 또는 설명 검색" /></InputGroup></div>
        <div className="ds-demo"><h3 className="ds-subtitle-2">입력 · Field</h3><Field><FieldLabel htmlFor="ds-recipient" required>관계자 이름</FieldLabel><Input id="ds-recipient" aria-required="true" placeholder="이름" /></Field></div>
        <div className="ds-demo"><h3 className="ds-subtitle-2">목록 필터 · Dropdown Menu</h3><ListFilter label="담당 필터 예시" value={ownerFilter} options={[{ value: "mine", label: "내 담당" }, { value: "all", label: "전체 담당" }]} onChange={setOwnerFilter} /></div>
        <div className="ds-demo"><h3 className="ds-subtitle-2">작업 상태</h3><div className="ds-inline"><Button disabled><Spinner /> 저장 중</Button><Skeleton className="h-9 w-32" /></div></div>
        <div className="ds-demo"><h3 className="ds-subtitle-2">창 제어 · Button</h3><div className="ds-inline"><WorkspaceIconButton icon="menu" label="메뉴 열기" /><WorkspaceIconButton icon="leftClose" label="목록 닫기" /><WorkspaceIconButton icon="rightOpen" label="기업 정보 열기" /><WorkspaceIconButton icon="close" label="닫기" /></div></div>
      </div>
      <div className="ds-demo ds-resizable-demo"><h3 className="ds-subtitle-2">세 칸 크기 조절 · Resizable</h3><ResizablePanelGroup orientation="horizontal" className="h-28 rounded-md border"><ResizablePanel defaultSize="24%" minSize="17%" className="ds-panel-list grid place-items-center">목록</ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize="52%" minSize="34%" className="grid place-items-center">현재 작업</ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize="24%" minSize="18%" className="grid place-items-center">기업 정보</ResizablePanel></ResizablePanelGroup></div>
    </section>
    <Separator />
    <LayoutDraft />
    <Separator />
    <PaletteDraft />
      </div>
    </SidebarInset>
  </SidebarProvider>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
