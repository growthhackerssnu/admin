import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import "./workspace-data.css";

export function WorkspaceCombobox({
  id,
  value,
  options,
  onChange,
  disabled,
  placeholder = "선택",
  searchLabel = "검색",
  required,
  onSearch,
  loading,
}: {
  id?: string;
  value: string;
  options: { value: string; label: string; keywords?: string[] }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchLabel?: string;
  required?: boolean;
  onSearch?: (query: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          disabled={disabled}
          className="ds-combobox-trigger"
        >
          <span>{selected?.label ?? placeholder}</span>
          <ChevronsUpDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="ds-workspace ds-combobox-content"
      >
        <Command shouldFilter={!onSearch}>
          <CommandInput
            aria-label={searchLabel}
            placeholder={searchLabel}
            onValueChange={onSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "검색 중…" : "검색 결과가 없습니다."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, ...(option.keywords ?? [])]}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {value === option.value && (
                    <Check aria-label="선택됨" className="ml-auto" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
