import { useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  WorkspaceSectionSidebar,
} from "@/components/ui/workspace-section-sidebar";
import {
  historyTabs,
  type HistoryTab,
} from "@/dh/listup/review/historyNavigation";
import "./workspace.css";
import "./navigation-preview.css";

export function NavigationPreview() {
  const [view, setView] = useState<HistoryTab>("review");
  return (
    <section id="workspace-navigation">
      <p className="ds-overline">Navigation / B</p>
      <h2 className="ds-headline-5">전역 메뉴와 내부 메뉴</h2>
      <p className="ds-body-2 ds-muted">
        전역 아이콘 바 52px · 내부 메뉴 176px · 공통 헤더 66px. 내부 메뉴만 접고
        펼칩니다.
      </p>
      <SidebarProvider
        defaultOpen
        className="ds-workspace dw-section-workspace ds-navigation-demo"
      >
        <WorkspaceSectionSidebar
          title="대협봇"
          showTitle={false}
          value={view}
          items={historyTabs}
          onChange={setView}
        />
        <SidebarInset>
          <header className="ds-navigation-demo-head">
            <h1 className="ds-section-page-title">
              {view === "review" ? "모닝루프" : historyTabs.find((item) => item.value === view)?.label}
            </h1>
          </header>
          <div className="ds-navigation-demo-content">
            {view !== "review" && <h2>모닝루프</h2>}
            <p>팀의 반복 업무를 정리하고 자동화하는 B2B 협업 서비스</p>
            <span>제목 16px · 섹션 제목과 본문 14px · 보조 정보 12px</span>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </section>
  );
}
