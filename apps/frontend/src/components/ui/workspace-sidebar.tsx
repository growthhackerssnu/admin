import { ClipboardList, Handshake, UsersRound, Wallet } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "./sidebar";
import { SidebarBrand } from "./sidebar-brand";

export function WorkspaceSidebar({ canManageOps = false }: { canManageOps?: boolean }) {
  return <Sidebar collapsible="icon" expandOnHover aria-label="워크스페이스 탐색" className="dw-sidebar">
    <SidebarBrand />
    <SidebarContent><SidebarGroup><SidebarGroupLabel>워크스페이스</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
      <SidebarMenuItem><SidebarMenuButton asChild isActive tooltip="대협봇"><a href="/dh"><Handshake /><span>대협봇</span></a></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton asChild tooltip="그핵드인"><a href="/hr"><UsersRound /><span>그핵드인</span></a></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton asChild tooltip="NUT"><a href="/nut"><Wallet /><span>NUT</span></a></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></SidebarGroupContent></SidebarGroup>
    {canManageOps && <SidebarGroup><SidebarGroupLabel>대외협력 운영</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
      <SidebarMenuItem><SidebarMenuButton asChild tooltip="검토 큐와 배정"><a href="/dh?view=operations"><ClipboardList /><span>검토 큐와 배정</span></a></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></SidebarGroupContent></SidebarGroup>}
    </SidebarContent>
  </Sidebar>;
}
