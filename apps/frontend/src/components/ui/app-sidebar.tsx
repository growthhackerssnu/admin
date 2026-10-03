import {
  ClipboardList,
  Handshake,
  ShieldCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Link, useInRouterContext } from "react-router-dom";
import {
  APP_LABEL,
  APP_PATH,
  reachableApps,
  type AppKey,
  type Role,
} from "@dhbot/ui-shell";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./sidebar";
import { SidebarBrand } from "./sidebar-brand";

const icons = {
  admin: ShieldCheck,
  dh: Handshake,
  hr: UsersRound,
  nut: Wallet,
};
export function AppSidebar({
  role = "acting",
  current,
  canManageOps = false,
}: {
  role?: Role;
  current: AppKey;
  canManageOps?: boolean;
}) {
  const inRouter = useInRouterContext();
  const apps = reachableApps(role);
  if (role === "alumni" || apps.length < 2) return null;
  return (
    <Sidebar
      collapsible="icon"
      expandOnHover
      aria-label="워크스페이스 탐색"
      className="dw-sidebar"
    >
      <SidebarBrand />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>워크스페이스</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {apps.map((app) => {
                const Icon = icons[app];
                const content = (
                  <>
                    <Icon />
                    <span>{APP_LABEL[app]}</span>
                  </>
                );
                return (
                  <SidebarMenuItem key={app}>
                    <SidebarMenuButton
                      asChild
                      isActive={current === app}
                      tooltip={APP_LABEL[app]}
                    >
                      {inRouter ? (
                        <Link
                          to={APP_PATH[app]}
                          aria-current={current === app ? "page" : undefined}
                        >
                          {content}
                        </Link>
                      ) : (
                        <a href={APP_PATH[app]}>{content}</a>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {canManageOps && (
          <SidebarGroup>
            <SidebarGroupLabel>대외협력 운영</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="검토 큐와 배정">
                    {inRouter ? (
                      <Link to="/dh?view=operations">
                        <ClipboardList />
                        <span>검토 큐와 배정</span>
                      </Link>
                    ) : (
                      <a href="/dh?view=operations">
                        <ClipboardList />
                        <span>검토 큐와 배정</span>
                      </a>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
