// Wire models: preserve server identities; these are not local preview Company/ContactTask.
export type FitVerdict = "fit" | "pending" | "unfit" | "not_assessed";
export type Channel = "email" | "linkedin";
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
export interface CompanyIdentity {
  id: string;
  name: string;
  legalName: string | null;
  aliases: string[];
  websiteUrl: string | null;
  canonicalDomain: string | null;
}
export interface CandidateRow {
  id: string;
  searchRunId: string;
  revision: number;
  company: CompanyIdentity;
  fit: {
    effectiveVerdict: FitVerdict;
    decisionSource: string;
    systemVerdict: string | null;
    humanVerdict: string | null;
    summary: string | null;
  };
  contacts: {
    status: string;
    usableCount: number;
    needsVerificationCount: number;
  };
  activeTasks: unknown[];
  latestFailedTask: unknown | null;
  updatedAt: string;
}
export interface Evidence {
  id: string;
  url: string;
  title: string | null;
  excerpt: string | null;
}
export interface Assessment {
  id: string;
  candidateId: string;
  verdict: string;
  summary: string;
  interventions: {
    id: string;
    area: string;
    possibility: { assessment: string; reason: string; evidenceIds: string[] };
    value: {
      assessment: string;
      reason: string;
      evidenceIds: string[];
      targetBusinessOutcome: string | null;
    };
    prerequisites: string[];
  }[];
  informationGaps: string[];
}
export interface CandidateDetail {
  candidate: {
    id: string;
    companyId: string;
    originSearchRunId: string;
    revision: number;
    effectiveFit: FitVerdict;
  };
  company: CompanyIdentity;
  currentResearch: null | {
    id: string;
    claims: {
      id: string;
      category: string;
      content: string;
      basis: string;
      evidenceIds: string[];
    }[];
    missingInformation: string[];
  };
  latestSystemAssessment: Assessment | null;
  activeHumanDecision: null | { verdict: string; reason: string | null };
  evidence: Evidence[];
  contactCounts: {
    usable: number;
    needsVerification: number;
    unusable: number;
  };
  activeTasks: unknown[];
  latestFailedTask: unknown | null;
}
export interface CandidateContact {
  evaluation: {
    id: string;
    endpointId: string;
    status: string;
    reason: string | null;
  };
  endpoint: {
    id: string;
    companyId: string;
    contactId: string | null;
    channel: Channel;
    address: string;
    ownerType: string;
  };
  person: { id: string; name: string; role: string | null } | null;
  evidence: Evidence[];
}
export interface OutreachContact {
  contactId: string;
  name: string;
  title: string | null;
  department: string | null;
  linkedinUrl: string | null;
  endpoints: {
    endpointId: string;
    channel: Channel;
    address: string;
    valid: boolean;
  }[];
  selectable: boolean;
  excludedReason: string | null;
}
export interface OutreachDetail {
  company: { id: string; name: string; product: string | null };
  id: string;
  companyId: string;
  currentTargetQuarterId: string | null;
  version: number;
  route: string;
  workStage: string;
  internalDecision: string;
  responseStatus: string;
  recipient: {
    contactId: string;
    endpointId: string | null;
    name: string | null;
    title: string | null;
    channel: Channel | null;
  } | null;
  draft: {
    revision: number;
    topic: string;
    subject: string;
    body: string;
    approvedRevision: number | null;
  } | null;
  allowedActions: string[];
  blockedReasons: unknown;
}
export interface CandidateQuery {
  searchRunId?: string;
  companyId?: string;
  effectiveFit?: FitVerdict;
  contactStatus?: string;
  decisionSource?: "system" | "human" | "none";
  q?: string;
  sort?: "created_at_desc" | "updated_at_desc";
  cursor?: string;
  limit?: number;
}

export interface OutreachRow {
  companyId: string;
  outreachId: string;
  name: string;
  product: string | null;
  workStage: string;
  owner: { id: string; displayName: string };
  lastSentAt: string | null;
}
export interface SearchInput {
  targetQuarterId: string;
  sources: {
    key: string;
    name: string;
    entryUrls: string[];
    query: string | null;
  }[];
  filters: {
    industries: string[];
    keywords: string[];
    regions: string[];
    companyStages: string[];
    excludedCompanyIds: string[];
    additionalConditions: string | null;
  };
  maxCompanies: number;
}
export interface SearchRun {
  id: string;
  targetQuarter: { id: string; year: number; quarter: number };
  status: string;
  sources: SearchInput["sources"];
  createdAt: string;
  assignedMember: { id: string; displayName: string };
  finishReason: string | null;
}
export interface SearchOptions {
  sources: string[];
  sourceAvailability: Record<string, { available: boolean; reason?: string }>;
}
