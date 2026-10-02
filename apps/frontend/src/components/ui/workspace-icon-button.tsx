import type { ComponentProps } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const icons = {
  menu: Menu,
  search: Search,
  leftOpen: PanelLeftOpen,
  leftClose: PanelLeftClose,
  rightOpen: PanelRightOpen,
  rightClose: PanelRightClose,
  close: X,
} as const;

/** Workspace chrome: accessible icon control built from the shadcn Button. */
export function WorkspaceIconButton({
  icon,
  label,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  icon: keyof typeof icons;
  label: string;
}) {
  const Icon = icons[icon];
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} {...props}>
      <Icon aria-hidden="true" />
    </Button>
  );
}
