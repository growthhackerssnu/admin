import type {
  Candidate,
  CompanyResearch,
  Contact,
  ContactEndpoint,
  ContactOptionAssessment,
  Evidence,
  FitAssessment,
  HumanFitDecision,
  InterventionAssessment,
  Member,
  ResearchClaim,
  ResearchTask,
  SearchRun,
} from "@/generated/prisma";
import type { ResultRef } from "./types";
import type { ConditionsSnapshot } from "@/config/listupExecution";

// 응답 키는 camelCase이고 Prisma 필드명과 같다(v0.3 §7.1). 그래도 직렬화를 거치는
// 이유는 Date → ISO 문자열 변환, 노출 필드 제한, effectiveFit의 null → "not_assessed"
// 변환 때문이다. enum "값"은 계속 snake_case다 — 바뀌는 건 키뿐이다.

type MemberRef = Pick<Member, "id" | "displayName">;

function actor(member: MemberRef) {
  return { id: member.id, displayName: member.displayName };
}

export function serializeSearchRun(
  run: SearchRun & {
    createdBy: MemberRef;
    assignedMember: MemberRef;
    targetQuarter: { id: string; year: number; quarter: number };
  },
) {
  // 읽기 모델은 스냅샷에서 sources·filters를 펼쳐 제공한다(v0.4 §6.4).
  const snapshot = run.conditionsSnapshot as unknown as ConditionsSnapshot;
  return {
    id: run.id,
    targetQuarter: {
      id: run.targetQuarter.id,
      year: run.targetQuarter.year,
      quarter: run.targetQuarter.quarter,
    },
    sources: snapshot.sources,
    filters: snapshot.filters,
    execution: snapshot.execution,
    status: run.status,
    duplicateExcludedCount: run.duplicateExcludedCount,
    finishReason: run.finishReason,
    createdBy: actor(run.createdBy),
    assignedMember: actor(run.assignedMember),
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
    sourceKey: evidence.sourceKey,
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
    originSearchRunId: research.originSearchRunId,
    taskId: research.taskId,
    claims: research.claims.map(serializeResearchClaim),
    missingInformation: research.missingInformation,
    createdAt: research.createdAt.toISOString(),
  };
}

export function serializeInterventionAssessment(intervention: InterventionAssessment) {
  return {
    id: intervention.id,
    area: intervention.area,
    possibility: {
      assessment: intervention.possibilityVerdict,
      reason: intervention.possibilityReason,
      evidenceIds: intervention.possibilityEvidenceIds,
    },
    prerequisites: intervention.prerequisites,
    value: {
      assessment: intervention.valueVerdict,
      reason: intervention.valueReason,
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
    informationGaps: assessment.informationGaps,
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
    originSearchRunId: candidate.originSearchRunId,
    companyId: candidate.companyId,
    discoveryEvidenceIds: candidate.discoveryEvidenceIds,
    currentResearchId: candidate.currentResearchId,
    latestSystemAssessmentId: candidate.latestSystemAssessmentId,
    activeHumanDecisionId: candidate.activeHumanDecisionId,
    effectiveFit: serializeEffectiveFit(candidate.effectiveFit),
    contactResearchStatus: candidate.contactResearchStatus,
    revision: candidate.revision,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

// 관계자·연락 수단은 발송 쪽과 같은 테이블을 쓴다(v0.4 §8.4). 발송 업무가 쓰는
// 필드(title, department, valid 등)는 여기서 내보내지 않는다.
export function serializeContactPerson(person: Contact) {
  return {
    id: person.id,
    companyId: person.companyId,
    name: person.name,
    role: person.role ?? person.title,
    jobFunction: person.jobFunction,
    seniority: person.seniority,
    employmentStatus: person.employmentStatus,
    employmentCheckedAt: person.employmentCheckedAt?.toISOString() ?? null,
    evidenceIds: person.evidenceIds,
  };
}

export function serializeContactEndpoint(endpoint: ContactEndpoint) {
  return {
    id: endpoint.id,
    companyId: endpoint.companyId,
    contactId: endpoint.contactId,
    ownerType: endpoint.ownerType,
    channel: endpoint.channel,
    address: endpoint.address,
    discoveryMethod: endpoint.discoveryMethod,
    ownershipStatus: endpoint.ownershipStatus,
    validationStatus: endpoint.validationStatus,
    reachabilityStatus: endpoint.reachabilityStatus,
    linkedinMethods: endpoint.linkedinMethods,
    evidenceIds: endpoint.evidenceIds,
    checkedAt: endpoint.checkedAt?.toISOString() ?? null,
  };
}

// confirmedBy가 있으면 사람이 직접 확인해 등록한 창구다(P-19). 조사가 만든 평가는
// null이며, 이 둘을 화면에서 구분할 수 있어야 한다.
export function serializeContactOptionAssessment(
  evaluation: ContactOptionAssessment & { confirmedBy?: MemberRef | null },
) {
  return {
    id: evaluation.id,
    candidateId: evaluation.candidateId,
    endpointId: evaluation.endpointId,
    status: evaluation.status,
    roleRelevance: evaluation.roleRelevance,
    decisionAuthority: evaluation.decisionAuthority,
    reason: evaluation.reason,
    sourceUrl: evaluation.sourceUrl,
    confirmedBy: evaluation.confirmedBy ? actor(evaluation.confirmedBy) : null,
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
