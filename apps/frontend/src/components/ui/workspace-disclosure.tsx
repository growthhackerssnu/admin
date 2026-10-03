import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";
import "./workspace-data.css";

export function WorkspaceDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Collapsible className="ds-disclosure">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ds-disclosure-trigger"
        >
          {label}
          <ChevronDown />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ds-disclosure-content">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
