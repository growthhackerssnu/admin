import { Badge } from "./badge";
export type WorkspaceTone = "neutral" | "info" | "success" | "warning" | "danger";
export function WorkspaceStatus({ children, tone = "neutral" }: { children: React.ReactNode; tone?: WorkspaceTone }) {
  return <Badge variant="outline" className="dw-status" data-tone={tone}>{children}</Badge>;
}
