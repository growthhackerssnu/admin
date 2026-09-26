// SearchRun의 sources/filters/limits는 생성 후 바뀌지 않고 조인 대상도 아니라서 Json
// 컬럼에 넣는다. 읽을 때 형태를 되찾기 위한 타입이며, 쓰기 경로에서는 zod 스키마가
// 같은 형태를 강제한다.

export type SourceConfig = {
  key: string;
  name: string;
  entry_urls: string[];
  query: string | null;
};

export type SearchFilters = {
  industries: string[];
  keywords: string[];
  regions: string[];
  company_stages: string[];
  excluded_company_ids: string[];
  additional_conditions: string | null;
};

export type SearchLimits = {
  max_companies: number;
  max_fit_followup_rounds: number;
  max_contact_search_rounds: number;
};

// FitAssessment.information_gaps도 같은 이유로 Json이다(스칼라 두 개, 조회 대상 아님).
export type InformationGap = {
  question: string;
  resolution_method: "public_research" | "company_confirmation";
};

// ResearchTask.result_refs — 가리키는 리소스 종류가 섞여 있어 형태만 맞춘다.
export type ResultRef = {
  resource_type: string;
  resource_id: string;
};
