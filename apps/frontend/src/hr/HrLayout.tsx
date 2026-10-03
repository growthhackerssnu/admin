import { useLayoutEffect } from "react";
import { Outlet } from "react-router-dom";
import "./theme.css";

// Route group styling only. Root ConfigProvider owns the shared theme, including portals.
export default function HrLayout() {
  useLayoutEffect(() => {
    document.body.classList.add("hr-theme-active");
    return () => document.body.classList.remove("hr-theme-active");
  }, []);
  return (
    <div className="hr-theme">
      <Outlet />
    </div>
  );
}
