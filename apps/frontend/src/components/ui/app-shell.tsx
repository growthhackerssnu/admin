import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AppKey, Role } from "@dhbot/ui-shell";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, useSidebar } from "./sidebar";
import { WorkspaceIconButton } from "./workspace-icon-button";
import "@/design-system/layout.css";

export const AppRoleContext = createContext<Role>("acting");
export function useAppRole() {
  return useContext(AppRoleContext);
}
// 알럼나이 중 19기 이후는 슬랙 백업도 갈 수 있다. role로는 모르니 /me의 slackBackup을 사람마다 한 번만 읽는다.
// supabase·api는 알럼나이일 때만 불러온다(이 셸을 쓰는 테스트가 supabase 설정 없이도 돌게).
let slackBackupCache: { userId: string; value: Promise<boolean> } | undefined;
export function useSlackBackup(role: Role) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (role !== "alumni") return;
    let alive = true;
    (async () => {
      const [{ supabase }, { getMe }] = await Promise.all([
        import("@/lib/supabase"),
        import("@/portal/lib/api"),
      ]);
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      if (slackBackupCache?.userId !== session.user.id)
        slackBackupCache = {
          userId: session.user.id,
          value: getMe(session.access_token).then(
            (me) => me.slackBackup,
            () => false,
          ),
        };
      const value = await slackBackupCache.value;
      if (alive) setAllowed(value);
    })();
    return () => {
      alive = false;
    };
  }, [role]);
  return role !== "alumni" || allowed;
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
  const slackBackup = useSlackBackup(role);
  return (
    <SidebarProvider className="ds-workspace app-shell-layout">
      <AppSidebar role={role} current={current} slackBackup={slackBackup} />
      <div className="app-shell-content">
        {(role !== "alumni" || slackBackup) && <ShellToolbar />}
        {children}
      </div>
    </SidebarProvider>
  );
}
