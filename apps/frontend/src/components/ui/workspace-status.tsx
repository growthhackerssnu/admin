import { Badge } from "./badge";
export type WorkspaceTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";
export function WorkspaceStatus({
  children,
  tone = "neutral",
  className = "",
  ...props
}: React.ComponentProps<typeof Badge> & { tone?: WorkspaceTone }) {
  return (
    <Badge
      {...props}
      variant="outline"
      className={`dw-status ${className}`}
      data-tone={tone}
    >
      {children}
    </Badge>
  );
}
