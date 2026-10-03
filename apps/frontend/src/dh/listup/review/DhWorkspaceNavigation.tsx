import { ClipboardList } from "lucide-react";
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
        canManageOps && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/dh?view=operations">
                  <ClipboardList />
                  <span>검토 큐와 배정</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )
      }
    />
  );
}
