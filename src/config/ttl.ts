/**
 * EVIDENCE.fact_key 별 재사용 가능 기간(TTL, 일 단위).
 * 만료된 필드만 재조사하여 중복 리서치를 방지한다 (계획서 "중복 재리서치 방지" 참조).
 * 러프 추정값이며 운영 데이터가 쌓이면 조정할 것.
 */
export const TTL_DAYS_BY_FACT_KEY: Record<string, number> = {
  employee_count: 45,
  funding_stage: 45,
  industry: 45,
  contact_email: 21,
  contact_phone: 21,
  contact_job_title: 30,
  linkedin_profile_url: 60,
};

export const DEFAULT_TTL_DAYS = 30;

/** 기업 생존/피벗 재확인(freshness re-check)을 강제하는 기준 나이. */
export const COMPANY_FRESHNESS_TTL_DAYS = 60;

export function isEvidenceStale(factKey: string, verifiedAt: Date, now: Date = new Date()): boolean {
  const ttlDays = TTL_DAYS_BY_FACT_KEY[factKey] ?? DEFAULT_TTL_DAYS;
  const ageMs = now.getTime() - verifiedAt.getTime();
  return ageMs > ttlDays * 24 * 60 * 60 * 1000;
}
