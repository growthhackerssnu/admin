import type {
  CompanyCommand,
  SearchInput,
  TemplateBindings,
  Workspace,
} from "../models/outreach";
export class RepositoryError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
// Replace this adapter at the composition root. No screen imports mock storage.
export interface OutreachRepository {
  load(): Promise<Workspace>;
  getTemplates(): Promise<TemplateBindings>;
  execute(
    companyId: string,
    expectedVersion: number,
    command: CompanyCommand,
  ): Promise<Workspace>;
  search(input: SearchInput, expectedCycleId: string): Promise<Workspace>;
  reset(): Promise<Workspace>;
}
