// #03 GET /search-options 응답의 고정 선택지. category_axes/category_items
// 같은 분류 체계 테이블은 소싱 파이프라인 범위(이번 계획 밖)라서, 그게 생기기
// 전까지는 목업이 쓰던 값을 그대로 고정 config로 둔다. version을 올리면
// 프론트가 캐시를 무효화할 수 있다.
export const SEARCH_OPTIONS_VERSION = "1";

export const searchOptions = {
  version: SEARCH_OPTIONS_VERSION,
  domains: ["교육", "커머스", "금융", "여행"],
  productTypes: ["앱", "웹", "SaaS"],
  companySizeRanges: ["1-10", "11-50", "51+"],
  sources: ["Google", "뉴스레터", "혁신의 숲"],
  channelTypes: ["email", "linkedin"],
  exclusions: ["하드웨어", "자율주행", "신약 개발"],
};
