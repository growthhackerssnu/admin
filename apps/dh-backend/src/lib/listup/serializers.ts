import type {
  Candidate,
  CandidateContact,
  CompanyPerson,
  CompanyResearch,
  ContactChannel,
  Evidence,
  FitAssessment,
  HumanFitDecision,
  InterventionAssessment,
  Member,
  ResearchClaim,
  ResearchTask,
  SearchRun,
} from "@/generated/prisma";
import type { InformationGap, ResultRef, SearchFilters, SearchLimits, SourceConfig } from "./types";

// DB는 camelCase(Prisma), wire는 snake_case다. 타입별로 손으로 옮긴다 — 범용
// deep-mapper를 쓰지 않는 이유는 enum 값과 _id 접미사가 정확해야 하고,
// effective_fit의 null → "not_assessed" 같은 변환이 필요하기 때문이다.

type MemberRef = Pick<Member, "id" | "displayName">;

function actor(member: MemberRef) {
  return { id: member.id, display_name: member.displayName };
}

export function serializeSearchRun(run: SearchRun & { createdBy: MemberRef; quarter: { id: string; label: string } }) {
  return {
    id: run.id,
    quarter: { id: run.quarter.id, label: run.quarter.label },
    source_policy: run.sourcePolicy,
    sources: run.sources as unknown as SourceConfig[],
    filters: run.filters as unknown as SearchFilters,
    limits: run.limits as unknown as SearchLimits,
    status: run.status,
    duplicate_excluded_count: run.duplicateExcludedCount,
    created_by: actor(run.createdBy),
    created_at: run.createdAt.toISOString(),
    started_at: run.startedAt?.toISOString() ?? null,
    finished_at: run.finishedAt?.toISOString() ?? null,
  };
}

export function serializeEvidence(evidence: Evidence) {
  return {
    id: evidence.id,
    company_id: evidence.companyId,
    search_run_id: evidence.searchRunId,
    url: evidence.url,
    source_name: evidence.sourceName,
    source_type: evidence.sourceType,
    title: evidence.title,
    excerpt: evidence.excerpt,
    published_at: evidence.publishedAt?.toISOString() ?? null,
    retrieved_at: evidence.retrievedAt.toISOString(),
  };
}

export function serializeResearchClaim(claim: ResearchClaim) {
  return {
    id: claim.id,
    category: claim.category,
    content: claim.content,
    basis: claim.basis,
    evidence_ids: claim.evidenceIds,
  };
}

export function serializeCompanyResearch(research: CompanyResearch & { claims: ResearchClaim[] }) {
  return {
    id: research.id,
    company_id: research.companyId,
    search_run_id: research.searchRunId,
    claims: research.claims.map(serializeResearchClaim),
    missing_information: research.missingInformation,
    created_at: research.createdAt.toISOString(),
  };
}

export function serializeInterventionAssessment(intervention: InterventionAssessment) {
  return {
    id: intervention.id,
    area: intervention.area,
    feasibility: {
      verdict: intervention.feasibilityVerdict,
      rationale: intervention.feasibilityRationale,
      evidence_ids: intervention.feasibilityEvidenceIds,
      required_conditions: intervention.requiredConditions,
    },
    value: {
      verdict: intervention.valueVerdict,
      rationale: intervention.valueRationale,
      evidence_ids: intervention.valueEvidenceIds,
      target_business_outcome: intervention.targetBusinessOutcome,
    },
  };
}

export function serializeFitAssessment(
  assessment: FitAssessment & { interventions: InterventionAssessment[] },
) {
  return {
    id: assessment.id,
    candidate_id: assessment.candidateId,
    research_id: assessment.researchId,
    verdict: assessment.verdict,
    summary: assessment.summary,
    interventions: assessment.interventions.map(serializeInterventionAssessment),
    information_gaps: assessment.informationGaps as unknown as InformationGap[],
    criteria_version: assessment.criteriaVersion,
    model_version: assessment.modelVersion,
    created_at: assessment.createdAt.toISOString(),
  };
}

export function serializeHumanFitDecision(decision: HumanFitDecision & { decidedBy: MemberRef }) {
  return {
    id: decision.id,
    candidate_id: decision.candidateId,
    verdict: decision.verdict,
    reason: decision.reason,
    intervention_note: decision.interventionNote,
    based_on_assessment_id: decision.basedOnAssessmentId,
    decided_by: actor(decision.decidedBy),
    created_at: decision.createdAt.toISOString(),
  };
}

// 명세는 effective_fit에 "not_assessed"를 포함하지만, DB에는 enum 4번째 값을 넣지 않고
// null로 둔다. 바깥으로 나갈 때만 문자열로 바꾼다.
export function serializeEffectiveFit(effectiveFit: Candidate["effectiveFit"]) {
  return effectiveFit ?? "not_assessed";
}

export function serializeCandidate(candidate: Candidate) {
  return {
    id: candidate.id,
    search_run_id: candidate.searchRunId,
    company_id: candidate.companyId,
    discovery_evidence_ids: candidate.discoveryEvidenceIds,
    current_research_id: candidate.currentResearchId,
    latest_system_assessment_id: candidate.latestSystemAssessmentId,
    active_human_decision_id: candidate.activeHumanDecisionId,
    effective_fit: serializeEffectiveFit(candidate.effectiveFit),
    contact_status: candidate.contactStatus,
    revision: candidate.revision,
    created_at: candidate.createdAt.toISOString(),
    updated_at: candidate.updatedAt.toISOString(),
  };
}

export function serializeCompanyPerson(person: CompanyPerson) {
  return {
    id: person.id,
    company_id: person.companyId,
    name: person.name,
    job_title: person.jobTitle,
    job_function: person.jobFunction,
    seniority: person.seniority,
    employment_status: person.employmentStatus,
    employment_evidence_ids: person.employmentEvidenceIds,
    checked_at: person.checkedAt.toISOString(),
  };
}

export function serializeContactChannel(channel: ContactChannel) {
  return {
    id: channel.id,
    company_id: channel.companyId,
    person_id: channel.personId,
    type: channel.type,
    value: channel.value,
    owner_type: channel.ownerType,
    discovery_method: channel.discoveryMethod,
    ownership_status: channel.ownershipStatus,
    validation_status: channel.validationStatus,
    reachability_status: channel.reachabilityStatus,
    linkedin_methods: channel.linkedinMethods,
    evidence_ids: channel.evidenceIds,
    checked_at: channel.checkedAt.toISOString(),
  };
}

export function serializeCandidateContact(evaluation: CandidateContact) {
  return {
    id: evaluation.id,
    candidate_id: evaluation.candidateId,
    contact_channel_id: evaluation.contactChannelId,
    status: evaluation.status,
    priority: evaluation.priority,
    role_relevance: evaluation.roleRelevance,
    decision_authority: evaluation.decisionAuthority,
    reason: evaluation.reason,
    checked_at: evaluation.checkedAt.toISOString(),
  };
}

export function serializeResearchTask(task: ResearchTask) {
  return {
    id: task.id,
    search_run_id: task.searchRunId,
    candidate_id: task.candidateId,
    parent_task_id: task.parentTaskId,
    type: task.type,
    trigger: task.trigger,
    requested_information: task.requestedInformation,
    followup_policy: task.followupPolicy,
    status: task.status,
    attempt: task.attempt,
    result_refs: task.resultRefs as unknown as ResultRef[],
    error: task.errorCode
      ? {
          code: task.errorCode,
          message: task.errorMessage ?? "",
          retryable: task.errorRetryable ?? false,
        }
      : null,
    created_at: task.createdAt.toISOString(),
    started_at: task.startedAt?.toISOString() ?? null,
    finished_at: task.finishedAt?.toISOString() ?? null,
  };
}
