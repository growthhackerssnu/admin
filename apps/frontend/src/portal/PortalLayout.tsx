import { useLayoutEffect } from "react";
import { Outlet } from "react-router-dom";
import "./portal.css";

// Route group styling only. Root ConfigProvider owns the shared theme, including portals.
export default function PortalLayout() {
  useLayoutEffect(() => {
    document.body.classList.add("portal-theme-active");
    return () => document.body.classList.remove("portal-theme-active");
  }, []);
  return (
    <div className="portal-theme">
      <Outlet />
    </div>
  );
}
