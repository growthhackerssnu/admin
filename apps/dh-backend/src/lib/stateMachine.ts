import type { InternalDecision, Response, Route, WorkStage } from "@/generated/prisma";

// 조회(#06)와 변경(#16~29) 엔드포인트가 공유하는 단일 판단 지점.
// 05_데이터 모델 제안.md §3(상태 축)·§3(라우팅 규칙)과 docs/admin/policies.md의
// 확정 규칙을 인코딩한다. 여기 없는 세부 조건은 각 쓰기 엔드포인트에서 보강하되,
// "지금 뭘 할 수 있는가"는 항상 이 함수를 거쳐 계산한다 — 엔드포인트마다 따로
// 판단하면 allowedActions가 서로 어긋날 수 있다.

export type OutreachAction =
  | "approveCompany"
  | "skipForCycle"
  | "excludeCompany"
  | "searchContacts"
  | "selectRecipient"
  | "changeRecipient"
  | "generateDraft"
  | "saveDraft"
  | "approveDraft"
  | "manualSendRecord"
  | "saveResponse";

export interface OutreachStateInput {
  route: Route;
  workStage: WorkStage;
  internalDecision: InternalDecision;
  currentCycleId: string;
  lastSentCycleId: string | null;
  recipientContactId: string | null;
  currentRevision: number | null;
  approvedRevision: number | null;
  companyPermanentlyExcluded: boolean;
  latestResponse: Pick<Response, "result"> | null;
  templateBound: boolean;
}

export interface OutreachState {
  allowedActions: OutreachAction[];
  blockedReasons: string[];
}

export function computeOutreachState(o: OutreachStateInput): OutreachState {
  const blockedReasons: string[] = [];

  if (o.companyPermanentlyExcluded || o.internalDecision === "excluded_permanently") {
    return { allowedActions: [], blockedReasons: ["영구 제외된 기업입니다."] };
  }
  if (o.internalDecision === "skipped_for_cycle") {
    return {
      allowedActions: [],
      blockedReasons: ["이번 차수 건너뛰기 처리됨. 다음 차수에 검토 대상으로 복귀합니다."],
    };
  }
  if (o.latestResponse?.result === "discussing") {
    return { allowedActions: [], blockedReasons: ["현재 논의 중 — 리스트업에서 제외됩니다."] };
  }

  const sameCycleAlreadySent = o.lastSentCycleId === o.currentCycleId;
  const allowed: OutreachAction[] = [];

  switch (o.workStage) {
    case "company_review": {
      if (sameCycleAlreadySent) {
        blockedReasons.push("이번 차수에 이미 발송했습니다. 담당자·채널을 바꿔도 추가 발송할 수 없습니다.");
      } else {
        allowed.push("approveCompany");
      }
      // 신규 경로는 건너뛰기를 허용하지 않는다 (05 문서 §3 경로별 내부 결정 규칙).
      if (o.route !== "new") allowed.push("skipForCycle");
      allowed.push("excludeCompany");
      break;
    }
    case "recipient_selection": {
      allowed.push("searchContacts", "selectRecipient");
      if (o.recipientContactId) allowed.push("changeRecipient");
      if (!o.templateBound) {
        blockedReasons.push("경로별 지정 템플릿이 연결되지 않아 새 초안을 생성할 수 없습니다.");
      } else if (o.recipientContactId) {
        allowed.push("generateDraft");
      }
      break;
    }
    case "draft_review": {
      allowed.push("saveDraft", "changeRecipient");
      if (o.currentRevision != null) allowed.push("approveDraft");
      break;
    }
    case "ready_to_send": {
      allowed.push("saveDraft", "manualSendRecord");
      break;
    }
    case "response_check": {
      // 과거 발송의 응답 기록은 활성 차수와 무관하게 항상 가능하다.
      allowed.push("saveResponse");
      if (sameCycleAlreadySent) {
        blockedReasons.push("응답 확인은 가능하지만, 이번 차수 추가 컨택은 할 수 없습니다.");
      }
      break;
    }
  }

  return { allowedActions: allowed, blockedReasons };
}
