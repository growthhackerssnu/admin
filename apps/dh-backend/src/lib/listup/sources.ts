// 탐색 소스 화이트리스트. 프론트 탐색 폼의 체크박스와 같은 값이다
// (apps/dh-frontend/src/listup/SourcingPage.tsx).
//
// 여기 없는 key로 탐색을 만들면 422 UNSUPPORTED_SOURCE로 거절한다 — LLM이나
// 클라이언트가 임의의 사이트를 긁게 두지 않기 위한 경계다.
//
// 각 소스를 실제로 어떻게 수집할지(검색 어댑터·허용 도메인 매핑)는 워커 단계에서
// 정한다. 명세 §9.1의 미확정 항목이다.
export const SUPPORTED_SOURCE_KEYS = ["Google", "뉴스레터", "혁신의 숲"] as const;

export function isSupportedSourceKey(key: string): boolean {
  return (SUPPORTED_SOURCE_KEYS as readonly string[]).includes(key);
}
