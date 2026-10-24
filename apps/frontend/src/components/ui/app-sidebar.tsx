import {
  Archive,
  CalendarCheck,
  ClipboardList,
  FolderKanban,
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
  SidebarHeader,
} from "./sidebar";
import { SidebarBrand } from "./sidebar-brand";
import { BrandLogo } from "./brand-logo";

const icons = {
  admin: ShieldCheck,
  dh: Handshake,
  hr: UsersRound,
  projects: FolderKanban,
  nut: Wallet,
  attendance: CalendarCheck,
  slack: Archive,
};
export function AppNavigationLinks({
  role,
  current,
  onNavigate,
  iconOnly = false,
  slackBackup = false,
}: {
  role: Role;
  current: AppKey;
  onNavigate?: () => void;
  iconOnly?: boolean;
  slackBackup?: boolean;
}) {
  const inRouter = useInRouterContext();
  return (
    <SidebarMenu>
      {reachableApps(role, { slackBackup }).map((app) => {
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
              tooltip={
                iconOnly
                  ? { children: APP_LABEL[app], hidden: false }
                  : APP_LABEL[app]
              }
            >
              {inRouter ? (
                <Link
                  to={APP_PATH[app]}
                  aria-label={APP_LABEL[app]}
                  aria-current={current === app ? "page" : undefined}
                  onClick={onNavigate}
                >
                  {content}
                </Link>
              ) : (
                <a
                  href={APP_PATH[app]}
                  aria-label={APP_LABEL[app]}
                  onClick={onNavigate}
                >
                  {content}
                </a>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
export function AppSidebar({
  role = "acting",
  current,
  canManageOps = false,
  appearance = "full",
  slackBackup = false,
}: {
  role?: Role;
  current: AppKey;
  canManageOps?: boolean;
  appearance?: "full" | "rail";
  /** 19기 이후 알럼나이면 true — 그핵드인과 슬랙 백업 두 곳이라 패널이 보인다. */
  slackBackup?: boolean;
}) {
  const inRouter = useInRouterContext();
  const apps = reachableApps(role, { slackBackup });
  if (apps.length < 2) return null;
  const content = (
    <>
      {appearance === "rail" ? (
        <SidebarHeader className="ds-app-rail-brand">
          <BrandLogo variant="signature-blue" width={32} />
          <BrandLogo variant="inline-blue" width={160} decorative />
        </SidebarHeader>
      ) : (
        <SidebarBrand />
      )}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>워크스페이스</SidebarGroupLabel>
          <SidebarGroupContent>
            <AppNavigationLinks
              role={role}
              current={current}
              slackBackup={slackBackup}
              iconOnly={appearance === "rail"}
            />
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
    </>
  );
  return (
    <Sidebar
      collapsible={appearance === "rail" ? "none" : "icon"}
      expandOnHover={appearance !== "rail"}
      aria-label="워크스페이스 탐색"
      className={`dw-sidebar${appearance === "rail" ? " ds-app-rail" : ""}`}
    >
      {appearance === "rail" ? (
        <div className="ds-app-rail-content">{content}</div>
      ) : (
        content
      )}
    </Sidebar>
  );
}
