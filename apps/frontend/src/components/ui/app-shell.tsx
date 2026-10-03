import { createContext, useContext, type ReactNode } from "react";
import type { AppKey, Role } from "@dhbot/ui-shell";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, useSidebar } from "./sidebar";
import { WorkspaceIconButton } from "./workspace-icon-button";
import "@/design-system/layout.css";

export const AppRoleContext = createContext<Role>("acting");
export function useAppRole() {
  return useContext(AppRoleContext);
}
function ShellToolbar() {
  const { toggleSidebar } = useSidebar();
  return (
    <header className="app-shell-toolbar">
      <WorkspaceIconButton
        icon="menu"
        label="주 메뉴 열기 또는 닫기"
        onClick={toggleSidebar}
      />
    </header>
  );
}
export function AppShell({
  role,
  current,
  children,
}: {
  role: Role;
  current: AppKey;
  children: ReactNode;
}) {
  return (
    <SidebarProvider className="ds-workspace app-shell-layout">
      <AppSidebar role={role} current={current} />
      <div className="app-shell-content">
        {role !== "alumni" && <ShellToolbar />}
        {children}
      </div>
    </SidebarProvider>
  );
}
