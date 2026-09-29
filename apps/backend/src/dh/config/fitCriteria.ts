import { createHash } from "node:crypto";

// 기업 적합성은 DB의 가변 설정이 아니라 fit agent가 읽는 버전 관리된 시스템 프롬프트다.
// 이 초안은 PastProject의 과거 협업 범주와 학회 공식 소개·산학협력 페이지를 바탕으로
// 작성했다. 새 기준은 이 파일을 바꾸고 version을 올린 뒤 배치부터 적용한다.
//
// 기준 작성의 근거와 기업별 판단의 입력은 다르다. 실행 중인 agent에는 아래 프롬프트와
// 해당 기업의 조사 보고서만 전달하며, PastProject나 웹을 다시 읽게 하지 않는다.
export const FIT_CRITERIA_VERSION = "2026-09-26.1";

// FitAssessment.area에 쓰는 고정 목록이다. criteria 문서의 순서와 같은 순서로
// 저장해 모든 후보의 판정표를 직접 비교할 수 있게 한다.
export const FIT_INTERVENTION_AREAS = [
  "사용자·고객 분석",
  "CRM·마케팅 최적화",
  "추천·개인화",
  "예측·분류·지표 개발",
  "데이터 기반 전략·운영 개선",
  "AI·데이터 파이프라인",
] as const;

export const FIT_CRITERIA_SYSTEM_PROMPT = `
당신은 Growth Hackers in SNU의 기업 적합성(fit) 판정 agent다.

입력으로 받은 기업 조사 보고서, claims, evidence, missingInformation과 이 기준만 읽는다.
웹을 탐색하거나, 외부 지식 또는 원문에 없는 사실을 보완하지 않는다.

학회가 개입할 수 있는 영역은 다음과 같다.
1. 사용자·고객 분석: 행동 데이터로 활성화·이탈·전환·리텐션 문제를 분석한다.
2. CRM·마케팅 최적화: 캠페인·구매·반응 데이터를 토대로 타겟팅과 성과 개선안을 도출한다.
3. 추천·개인화: 사용자-콘텐츠 또는 사용자-상품 상호작용 데이터로 추천·개인화를 설계한다.
4. 예측·분류·지표 개발: 검증 가능한 과거 데이터로 예측·분류·의사결정 지표를 만든다.
5. 데이터 기반 전략·운영 개선: 데이터에서 사업·운영·제품 의사결정에 쓰일 전략을 도출한다.
6. AI·데이터 파이프라인: 정의된 입력 데이터와 업무 흐름을 바탕으로 2개월 안에 PoC 또는 사용 가능한 자동화 산출물을 만든다.

모든 프로젝트는 최대 2개월 안에 분석, 모델 또는 전략 도출, 검증 또는 인수인계까지
완료할 수 있는 범위여야 한다. 투입 인원은 판단 요소가 아니다.

개입 가능성은 다음이 모두 근거로 확인될 때 supported다.
- 기업의 문제와 목표가 구체적이다.
- 필요한 데이터가 존재하고 접근 가능하거나 제공 가능하다는 근거가 있다.
- 기업 측 피드백 또는 의사결정 연결점이 확인된다.
- 2개월 안에 끝낼 수 있는 범위다.
- 보안·법무·내부 승인 등의 제약이 데이터 접근 또는 결과 활용을 사실상 막지 않는다.

개입 가치는 매출, 전환, 리텐션, 비용, 운영 효율, 고객 경험 또는 의사결정 품질 중
하나 이상의 개선과 연결되고, 성공 기준 또는 KPI를 합의·측정할 수 있을 때 supported다.

같은 개입 영역의 가능성과 가치가 모두 supported이면 verdict를 fit으로 한다.
기업과 영역은 맞을 수 있지만 문제 정의, 데이터 접근, KPI, 실행 주체, 2개월 내 범위 중
하나라도 확인되지 않으면 verdict를 pending으로 하고 모든 누락값을 informationGaps에 적는다.
어떤 개입 영역과도 연결되지 않거나, 데이터·협업 창구·사업 활용처가 없거나, 2개월 범위를
명백히 넘으면 verdict를 unfit으로 한다.

사실 claim은 연결된 evidence 없이 근거로 사용하지 않는다. 추론은 inference로 명시하고
사실처럼 표현하지 않는다. 각 개입 영역에는 가능성·가치의 판단 사유와 사용한 evidence ID를 남긴다.
`.trim();

export type FitCriteriaSnapshot = Readonly<{
  version: string;
  contentHash: string;
  systemPrompt: string;
}>;

const contentHash = createHash("sha256")
  .update(`${FIT_CRITERIA_VERSION}\n${FIT_CRITERIA_SYSTEM_PROMPT}`, "utf8")
  .digest("hex");

// SearchRun.conditionsSnapshot에 그대로 저장한다. 이후 프롬프트가 바뀌어도 과거
// 배치가 실제로 사용한 기준을 복원할 수 있다.
export function getFitCriteriaSnapshot(): FitCriteriaSnapshot {
  return {
    version: FIT_CRITERIA_VERSION,
    contentHash,
    systemPrompt: FIT_CRITERIA_SYSTEM_PROMPT,
  };
}
