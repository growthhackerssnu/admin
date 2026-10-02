import { BrandLogo } from "./brand-logo";
import { SidebarHeader, useSidebar } from "./sidebar";
import "./sidebar-brand.css";

export function SidebarBrand() {
  const { state, isMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  return <SidebarHeader className="ds-sidebar-brand-header">
    <div className="ds-sidebar-brand" data-collapsed={collapsed}>
      <BrandLogo variant={collapsed ? "signature-blue" : "inline-black"} width={collapsed ? 32 : 160} />
    </div>
  </SidebarHeader>;
}
