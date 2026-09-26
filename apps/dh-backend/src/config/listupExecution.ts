import type { FitCriteriaSnapshot } from "@/config/fitCriteria";

// 탐색 배치의 실행 설정. 사용자가 요청 본문으로 보내지 않고(v0.4 §6.4) 서버가 정한 뒤
// 생성 시점에 SearchRun.conditionsSnapshot으로 복사한다. 여기 값을 나중에 바꿔도 과거
// 배치가 어떤 상한으로 돌았는지는 스냅샷에 남는다.
//
// ## 2026-09-26 확정된 정책
//
// maxCompanies는 **조사 상한**이지 확보 목표가 아니다. 10개를 걸어도 적합·연락 가능이
// 6개면 6개로 끝낸다. 목표를 채울 때까지 무한히 반복하지 않고, 아래 세 루프가 각자의
// 횟수에서 멈추며 부분 완료로 종료한다.
//
// 루프가 셋인 이유: 서로 다른 계기로 돌고 한쪽이 다른 쪽의 몫을 잡아먹으면 안 된다.
//   maxDiscoveryRounds        배치 전체. "기업을 더 찾아온다"를 몇 번까지 시도할지
//   maxResearchFollowupRounds 후보별. 찾은 기업의 정보가 부족해 다시 조사하는 횟수
//   maxContactSearchRounds    후보별. 적합 판정 후 연락 창구를 찾는 횟수
//
// 셋을 한 카운터로 합치면 기업 정보 보완을 두 번 한 후보가 연락 조사를 한 번밖에
// 못 하게 된다. 지금은 값이 모두 3이지만 의미가 달라 따로 센다.
//
// 아직 미정(v0.4 §0.2): 기술적 재시도 한도, 시간·비용 상한. 워커를 붙일 때 정한다.
// 기술적 재시도(네트워크 오류 등)는 위 조사 라운드와 별개로 센다.
// fitCriteria 스냅샷 필드를 추가하면서 conditionsSnapshot 구조를 올렸다.
export const LISTUP_EXECUTION_VERSION = "2026-09-26.2";

const fixedListupExecution = {
  maxDiscoveryRounds: 3,
  maxResearchFollowupRounds: 3,
  maxContactSearchRounds: 3,
};

export function createListupExecution(maxCompanies: number) {
  return { maxCompanies, ...fixedListupExecution };
}

export const listupExecution = createListupExecution(10);

export type ListupExecution = ReturnType<typeof createListupExecution>;

// conditionsSnapshot에 저장하는 형태. schemaVersion은 나중에 스냅샷 구조가 바뀌어도
// 과거 행을 어떻게 읽어야 하는지 구분하기 위한 것이다.
export type ConditionsSnapshot = {
  schemaVersion: string;
  // DB의 별도 기준 레코드가 아니라, 배치 시작 시점의 agent 프롬프트를 고정한다.
  fitCriteria: FitCriteriaSnapshot;
  sources: { key: string; name: string; entryUrls: string[]; query: string | null }[];
  filters: {
    industries: string[];
    keywords: string[];
    regions: string[];
    companyStages: string[];
    excludedCompanyIds: string[];
    additionalConditions: string | null;
  };
  execution: ListupExecution;
};
