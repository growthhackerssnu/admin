import type {
  Company,
  CompanyCommand,
  Cycle,
  TemplateBindings,
} from "../models/outreach";
export interface WorkProps {
  company: Company;
  cycle: Cycle;
  templates: TemplateBindings;
  busy: boolean;
  onDirtyChange: (dirty: boolean) => void;
  execute: (command: CompanyCommand) => Promise<boolean>;
}
