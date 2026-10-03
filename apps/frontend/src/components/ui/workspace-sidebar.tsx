import { AppSidebar } from "./app-sidebar";
import { useAppRole } from "./app-shell";
/** Existing DH and gallery entry point; the sidebar itself is app-wide. */
export function WorkspaceSidebar({
  canManageOps = false,
}: {
  canManageOps?: boolean;
}) {
  return (
    <AppSidebar role={useAppRole()} current="dh" canManageOps={canManageOps} />
  );
}
