// 탐색 소스 화이트리스트. 프론트 탐색 폼의 체크박스와 같은 값이다
// (apps/dh-frontend/src/listup/SourcingPage.tsx).
//
// 여기 없는 key로 탐색을 만들면 422 UNSUPPORTED_SOURCE로 거절한다 — LLM이나
// 클라이언트가 임의의 사이트를 긁게 두지 않기 위한 경계다.
//
// 각 소스를 실제로 어떻게 수집할지(검색 어댑터·허용 도메인 매핑)는 워커 단계에서
// 정한다. 명세 §9.1의 미확정 항목이다.
export const SUPPORTED_SOURCE_KEYS = ["Google", "뉴스레터", "혁신의 숲"] as const;

const UNAVAILABLE_SOURCE_REASONS: Partial<Record<(typeof SUPPORTED_SOURCE_KEYS)[number], string>> = {
  "혁신의 숲": "혁신의숲 계약 API 자격증명이 필요합니다.",
};

export function isSupportedSourceKey(key: string): boolean {
  return (SUPPORTED_SOURCE_KEYS as readonly string[]).includes(key);
}

export function isSourceAvailable(key: string): boolean {
  return isSupportedSourceKey(key) && !(key in UNAVAILABLE_SOURCE_REASONS);
}

export function sourceUnavailableReason(key: string): string | null {
  return UNAVAILABLE_SOURCE_REASONS[key as keyof typeof UNAVAILABLE_SOURCE_REASONS] ?? null;
}

export function invalidSourceEntryUrl(key: string, value: string): string | null {
  if (key !== "뉴스레터") return "직접 URL 수집은 뉴스레터 소스에서만 지원합니다.";
  try {
    const host = new URL(value).hostname;
    return host === "startuprecipe.co.kr" || host === "www.startuprecipe.co.kr"
      ? null
      : "뉴스레터 직접 URL은 startuprecipe.co.kr 이어야 합니다.";
  } catch {
    return "올바른 URL이 아닙니다.";
  }
}
