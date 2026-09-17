/**
 * 소싱 단계 web_search의 탐색 범위 화이트리스트.
 *
 * 화이트리스트 없이 열린 웹을 검색하면 max_uses 안에서 블로그·홍보성 글·동명이인
 * 페이지에 검색 횟수를 소모해, 정작 필요한 투자단계/임직원수를 못 채운 채 끝나는 일이
 * 잦았다. 소싱에 실제로 필요한 사실(실존 여부, 공식 도메인, 업종, 투자단계, 규모)은
 * 아래 네 부류 안에서 거의 다 확인되므로, 검색 범위를 여기로 고정한다.
 *
 * 운영 메모:
 * - 서브도메인은 자동으로 포함되므로 등록 호스트만 적는다(jumpit.saramin.co.kr 등).
 * - 회사 공식 홈페이지는 후보마다 달라 화이트리스트에 넣을 수 없다. 대신 아래 DB들이
 *   기업 프로필에 홈페이지 주소를 노출하므로 그쪽에서 읽어온다. 그래도 도메인을
 *   못 찾은 경우에만 evaluateCandidate가 범위 제한 없이 한 번 더 검색한다.
 * - 후보의 출처 기사 도메인은 evaluateCandidate가 호출 시점에 자동으로 합친다.
 *   SourceFeed에 새 매체를 추가해도 이 파일을 고칠 필요가 없다.
 */
export const SOURCING_SEARCH_DOMAINS: readonly string[] = [
  // 스타트업 DB — 실존 여부, 공식 도메인, 투자 라운드, 임직원 규모의 1차 출처
  "innoforest.co.kr",
  "thevc.kr",
  "nextunicorn.kr",
  "rocketpunch.com",

  // 채용 플랫폼 — 임직원 규모와 업종을 역산할 수 있는 신호
  "wanted.co.kr",
  "jobkorea.co.kr",
  "saramin.co.kr",
  "jobplanet.co.kr",
  "programmers.co.kr",

  // 스타트업 전문 매체 — 투자 유치 보도자료
  "platum.kr",
  "outstanding.kr",
  "venturesquare.net",
  "startupn.kr",
  "byline.network",
  "thebell.co.kr",

  // 공공 — 법인 실존과 벤처/창업 인증 확인
  "venturein.or.kr",
  "k-startup.go.kr",
  "dart.fss.or.kr",
  "data.go.kr",
];

/** URL에서 호스트명만 뽑는다. 파싱 불가한 값은 무시한다(화이트리스트에 넣지 않는다). */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * 기본 화이트리스트에 후보의 출처 기사 도메인을 더한 탐색 범위를 만든다.
 * 출처 기사는 "이 후보가 실제로 어느 회사를 가리키는지"를 판단하는 1차 근거라
 * 항상 읽을 수 있어야 한다.
 */
export function buildSourcingSearchScope(sourceUrl: string): string[] {
  const host = hostnameOf(sourceUrl);
  if (!host || SOURCING_SEARCH_DOMAINS.includes(host)) {
    return [...SOURCING_SEARCH_DOMAINS];
  }
  return [...SOURCING_SEARCH_DOMAINS, host];
}
