import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import "./list-filter.css";

type ListFilterProps = {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

export function ListFilter({ label, options, value, onChange }: ListFilterProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="ds-list-filter-trigger" aria-label={label}>
          <span className="ds-list-filter-label">
            <span>{options.find((option) => option.value === value)?.label ?? label}</span>
            {options.map((option) => <span key={option.value} className="ds-list-filter-sizing" aria-hidden="true">{option.label}</span>)}
          </span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="ds-list-filter-content" align="end" sideOffset={4} aria-label={label}>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => <DropdownMenuRadioItem className="ds-list-filter-option" key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
