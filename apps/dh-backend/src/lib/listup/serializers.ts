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

// 응답 키는 camelCase이고 Prisma 필드명과 같다(v0.3 §7.1). 그래도 직렬화를 거치는
// 이유는 Date → ISO 문자열 변환, 노출 필드 제한, effectiveFit의 null → "not_assessed"
// 변환 때문이다. enum "값"은 계속 snake_case다 — 바뀌는 건 키뿐이다.

type MemberRef = Pick<Member, "id" | "displayName">;

function actor(member: MemberRef) {
  return { id: member.id, displayName: member.displayName };
}

export function serializeSearchRun(run: SearchRun & { createdBy: MemberRef; quarter: { id: string; label: string } }) {
  return {
    id: run.id,
    quarter: { id: run.quarter.id, label: run.quarter.label },
    sourcePolicy: run.sourcePolicy,
    sources: run.sources as unknown as SourceConfig[],
    filters: run.filters as unknown as SearchFilters,
    limits: run.limits as unknown as SearchLimits,
    status: run.status,
    duplicateExcludedCount: run.duplicateExcludedCount,
    createdBy: actor(run.createdBy),
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

export function serializeEvidence(evidence: Evidence) {
  return {
    id: evidence.id,
    companyId: evidence.companyId,
    searchRunId: evidence.searchRunId,
    url: evidence.url,
    sourceName: evidence.sourceName,
    sourceType: evidence.sourceType,
    title: evidence.title,
    excerpt: evidence.excerpt,
    publishedAt: evidence.publishedAt?.toISOString() ?? null,
    retrievedAt: evidence.retrievedAt.toISOString(),
  };
}

export function serializeResearchClaim(claim: ResearchClaim) {
  return {
    id: claim.id,
    category: claim.category,
    content: claim.content,
    basis: claim.basis,
    evidenceIds: claim.evidenceIds,
  };
}

export function serializeCompanyResearch(research: CompanyResearch & { claims: ResearchClaim[] }) {
  return {
    id: research.id,
    companyId: research.companyId,
    searchRunId: research.searchRunId,
    claims: research.claims.map(serializeResearchClaim),
    missingInformation: research.missingInformation,
    createdAt: research.createdAt.toISOString(),
  };
}

export function serializeInterventionAssessment(intervention: InterventionAssessment) {
  return {
    id: intervention.id,
    area: intervention.area,
    feasibility: {
      verdict: intervention.feasibilityVerdict,
      rationale: intervention.feasibilityRationale,
      evidenceIds: intervention.feasibilityEvidenceIds,
      requiredConditions: intervention.requiredConditions,
    },
    value: {
      verdict: intervention.valueVerdict,
      rationale: intervention.valueRationale,
      evidenceIds: intervention.valueEvidenceIds,
      targetBusinessOutcome: intervention.targetBusinessOutcome,
    },
  };
}

export function serializeFitAssessment(
  assessment: FitAssessment & { interventions: InterventionAssessment[] },
) {
  return {
    id: assessment.id,
    candidateId: assessment.candidateId,
    researchId: assessment.researchId,
    verdict: assessment.verdict,
    summary: assessment.summary,
    interventions: assessment.interventions.map(serializeInterventionAssessment),
    informationGaps: assessment.informationGaps as unknown as InformationGap[],
    criteriaVersion: assessment.criteriaVersion,
    modelVersion: assessment.modelVersion,
    createdAt: assessment.createdAt.toISOString(),
  };
}

export function serializeHumanFitDecision(decision: HumanFitDecision & { decidedBy: MemberRef }) {
  return {
    id: decision.id,
    candidateId: decision.candidateId,
    verdict: decision.verdict,
    reason: decision.reason,
    interventionNote: decision.interventionNote,
    basedOnAssessmentId: decision.basedOnAssessmentId,
    decidedBy: actor(decision.decidedBy),
    createdAt: decision.createdAt.toISOString(),
  };
}

// 명세는 effectiveFit에 "not_assessed"를 포함하지만, DB에는 enum 4번째 값을 넣지 않고
// null로 둔다. 바깥으로 나갈 때만 문자열로 바꾼다.
export function serializeEffectiveFit(effectiveFit: Candidate["effectiveFit"]) {
  return effectiveFit ?? "not_assessed";
}

export function serializeCandidate(candidate: Candidate) {
  return {
    id: candidate.id,
    searchRunId: candidate.searchRunId,
    companyId: candidate.companyId,
    discoveryEvidenceIds: candidate.discoveryEvidenceIds,
    currentResearchId: candidate.currentResearchId,
    latestSystemAssessmentId: candidate.latestSystemAssessmentId,
    activeHumanDecisionId: candidate.activeHumanDecisionId,
    effectiveFit: serializeEffectiveFit(candidate.effectiveFit),
    contactStatus: candidate.contactStatus,
    revision: candidate.revision,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

export function serializeCompanyPerson(person: CompanyPerson) {
  return {
    id: person.id,
    companyId: person.companyId,
    name: person.name,
    jobTitle: person.jobTitle,
    jobFunction: person.jobFunction,
    seniority: person.seniority,
    employmentStatus: person.employmentStatus,
    employmentEvidenceIds: person.employmentEvidenceIds,
    checkedAt: person.checkedAt.toISOString(),
  };
}

export function serializeContactChannel(channel: ContactChannel) {
  return {
    id: channel.id,
    companyId: channel.companyId,
    personId: channel.personId,
    type: channel.type,
    value: channel.value,
    ownerType: channel.ownerType,
    discoveryMethod: channel.discoveryMethod,
    ownershipStatus: channel.ownershipStatus,
    validationStatus: channel.validationStatus,
    reachabilityStatus: channel.reachabilityStatus,
    linkedinMethods: channel.linkedinMethods,
    evidenceIds: channel.evidenceIds,
    checkedAt: channel.checkedAt.toISOString(),
  };
}

export function serializeCandidateContact(evaluation: CandidateContact) {
  return {
    id: evaluation.id,
    candidateId: evaluation.candidateId,
    contactChannelId: evaluation.contactChannelId,
    status: evaluation.status,
    priority: evaluation.priority,
    roleRelevance: evaluation.roleRelevance,
    decisionAuthority: evaluation.decisionAuthority,
    reason: evaluation.reason,
    checkedAt: evaluation.checkedAt.toISOString(),
  };
}

export function serializeResearchTask(task: ResearchTask) {
  return {
    id: task.id,
    searchRunId: task.searchRunId,
    candidateId: task.candidateId,
    parentTaskId: task.parentTaskId,
    type: task.type,
    trigger: task.trigger,
    requestedInformation: task.requestedInformation,
    followupPolicy: task.followupPolicy,
    status: task.status,
    attempt: task.attempt,
    resultRefs: task.resultRefs as unknown as ResultRef[],
    error: task.errorCode
      ? {
          code: task.errorCode,
          message: task.errorMessage ?? "",
          retryable: task.errorRetryable ?? false,
        }
      : null,
    createdAt: task.createdAt.toISOString(),
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.finishedAt?.toISOString() ?? null,
  };
}
