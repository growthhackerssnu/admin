// SearchRun의 sources/filters/limits는 생성 후 바뀌지 않고 조인 대상도 아니라서 Json
// 컬럼에 넣는다. 요청 본문을 받은 그대로(camelCase) 보관하고 그대로 내보내므로,
// 이 타입이 저장 형태이자 wire 형태다 — 중첩 객체를 변환하는 코드를 두지 않는다.

export type SourceConfig = {
  key: string;
  name: string;
  entryUrls: string[];
  query: string | null;
};

export type SearchFilters = {
  industries: string[];
  keywords: string[];
  regions: string[];
  companyStages: string[];
  excludedCompanyIds: string[];
  additionalConditions: string | null;
};

export type SearchLimits = {
  maxCompanies: number;
  maxFitFollowupRounds: number;
  maxContactSearchRounds: number;
};

// ResearchTask.resultRefs — 가리키는 리소스 종류가 섞여 있어 형태만 맞춘다(v0.4 §5.2).
export type ResultRef =
  | {
      type: "companyResearch" | "fitAssessment" | "contactEndpoint" | "draftRevision" | "candidate" | "evidence";
      id: string;
    }
  | {
      type: "source";
      sourceKey: string;
      status: "succeeded" | "failed";
      foundCount: number;
      acceptedCount: number;
      webSearchCallCount?: number;
      inputTokens?: number;
      outputTokens?: number;
      errorMessage?: string;
    };
