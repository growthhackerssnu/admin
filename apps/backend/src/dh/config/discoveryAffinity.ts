import { createHash } from "node:crypto";

// Company_DB_Master.xlsx의 과거 프로젝트와 기존 컨택 이력에서 추린 공통점이다.
// 사용자 필터를 대체하거나 fit을 확정하지 않으며, 발견 결과의 검색 렌즈와 동점 우선순위에만 쓴다.
export const DISCOVERY_AFFINITY_VERSION = "2026-09-27.1";

const queryLenses = [
  [
    "플랫폼 커머스 콘텐츠 구독 모빌리티 핀테크 에듀테크 헬스케어 SaaS",
    "고객 행동 데이터 추천 개인화 리텐션 CRM",
    "마케팅 전환 광고 가격 최적화 운영 데이터",
  ],
  [
    "신규 출시 서비스 확장 B2B 전환 업무 자동화",
    "예측 분류 수요 이탈 매출 AI 모델링",
    "위치 데이터 거래 데이터 콘텐츠 데이터 고객 경험",
  ],
  [
    "기업용 데이터 협업 AI 자동화 제품",
    "구독 커뮤니티 크리에이터 콘텐츠 개인화",
    "마켓플레이스 여행 푸드 패션 리테일 성장",
  ],
] as const;

const rankingTerms = [
  "플랫폼", "앱", "커머스", "마켓플레이스", "구독", "콘텐츠", "미디어",
  "모빌리티", "핀테크", "에듀테크", "헬스케어", "saas", "b2b", "데이터",
  "ai", "추천", "개인화", "세그먼트", "리텐션", "crm", "전환", "마케팅",
  "광고", "예측", "분류", "가격", "운영", "자동화", "위치",
] as const;

export type DiscoveryAffinitySnapshot = Readonly<{
  version: string;
  contentHash: string;
  queryLenses: readonly (readonly string[])[];
  rankingTerms: readonly string[];
}>;

const contentHash = createHash("sha256")
  .update(
    JSON.stringify({ version: DISCOVERY_AFFINITY_VERSION, queryLenses, rankingTerms }),
    "utf8",
  )
  .digest("hex");

export function getDiscoveryAffinitySnapshot(): DiscoveryAffinitySnapshot {
  return { version: DISCOVERY_AFFINITY_VERSION, contentHash, queryLenses, rankingTerms };
}
