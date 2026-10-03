import type { TagProps } from "antd";
import { WorkspaceStatus, type WorkspaceTone } from "./workspace-status";
const tones: Record<string, WorkspaceTone> = {
  green: "success",
  success: "success",
  red: "danger",
  error: "danger",
  gold: "warning",
  orange: "warning",
  warning: "warning",
  blue: "info",
  processing: "info",
};
export function AppTag({ color, children, className, style }: TagProps) {
  return (
    <WorkspaceStatus
      tone={tones[color ?? ""] ?? "neutral"}
      className={className}
      style={style}
    >
      {children}
    </WorkspaceStatus>
  );
}
