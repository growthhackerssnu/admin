import { FolderX, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { WorkspaceSectionSidebar } from "@/components/ui/workspace-section-sidebar";
import { historyTabs, type HistoryTab } from "./historyNavigation";

export function DhWorkspaceNavigation({
  value,
  onChange,
  canManageOps = false,
}: {
  value: HistoryTab;
  onChange: (value: HistoryTab) => void | boolean | Promise<void | boolean>;
  canManageOps?: boolean;
}) {
  return (
    <WorkspaceSectionSidebar
      title="대협봇"
      showTitle={false}
      value={value}
      items={historyTabs}
      onChange={onChange}
      footer={
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/dh?view=auto-excluded">
                <FolderX />
                <span>자동 제외된 기업</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {canManageOps && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to={{ search: "?view=settings" }}>
                  <Settings />
                  <span>설정</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      }
    />
  );
}
