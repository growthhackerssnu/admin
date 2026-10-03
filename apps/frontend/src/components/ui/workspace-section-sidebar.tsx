import type { ReactNode } from "react";
import { reachableApps } from "@dhbot/ui-shell";
import { AppSidebar, AppNavigationLinks } from "./app-sidebar";
import { useAppRole } from "./app-shell";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./sidebar";
import { WorkspaceIconButton } from "./workspace-icon-button";
import "./workspace-section-sidebar.css";

/** The app rail expands independently on hover; the section menu uses one fixed toggle. */
export function WorkspaceSectionSidebar<T extends string>({
  title,
  showTitle = true,
  value,
  items,
  onChange,
  footer,
}: {
  title: string;
  showTitle?: boolean;
  value: T;
  items: readonly { value: T; label: string }[];
  onChange: (value: T) => void | boolean | Promise<void | boolean>;
  footer?: ReactNode;
}) {
  const role = useAppRole();
  const { isMobile, setOpenMobile } = useSidebar();
  const hasGlobal = role !== "alumni" && reachableApps(role).length > 1;
  const choose = async (next: T) => {
    if ((await onChange(next)) !== false && isMobile) setOpenMobile(false);
  };
  return (
    <div className="ds-section-navigation" data-global-rail={hasGlobal}>
      <AppSidebar role={role} current="dh" appearance="rail" />
      <WorkspaceSectionToggle className="ds-section-menu-toggle" />
      <Sidebar
        collapsible="offcanvas"
        className="ds-workspace ds-section-sidebar"
        aria-label={`${title} 메뉴`}
      >
        <SidebarHeader className="ds-section-sidebar-head">
          {showTitle && <strong>{title}</strong>}
          {isMobile && <WorkspaceSectionToggle />}
        </SidebarHeader>
        <SidebarContent>
          {isMobile && hasGlobal && (
            <SidebarGroup>
              <SidebarGroupLabel>워크스페이스</SidebarGroupLabel>
              <SidebarGroupContent>
                <AppNavigationLinks
                  role={role}
                  current="dh"
                  onNavigate={() => setOpenMobile(false)}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <SidebarGroup>
            {isMobile && <SidebarGroupLabel>{title}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu aria-label={`${title} 페이지`}>
                {items.map((item) => (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      isActive={value === item.value}
                      aria-current={value === item.value ? "page" : undefined}
                      onClick={() => void choose(item.value)}
                    >
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        {footer && <SidebarFooter>{footer}</SidebarFooter>}
      </Sidebar>
    </div>
  );
}

export function WorkspaceSectionToggle({ className }: { className?: string }) {
  const { toggleSidebar, state, isMobile, openMobile } = useSidebar();
  const open = isMobile ? openMobile : state === "expanded";
  return (
    <WorkspaceIconButton
      icon={open ? "leftClose" : "leftOpen"}
      className={className}
      label="대협 메뉴 열기 또는 닫기"
      aria-expanded={open}
      onClick={toggleSidebar}
    />
  );
}
