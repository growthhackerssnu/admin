/**
 * LLM을 태우기 전 1차 컷: 뉴스 헤드라인에서 회사명으로 보이는 선두 구절만 규칙 기반으로 뽑아낸다.
 * 한국 스타트업 뉴스 헤드라인은 "OOO, XX억 투자 유치" 처럼 회사명으로 시작해 구분자가
 * 뒤따르는 패턴이 흔하다는 점을 이용한다. 완벽한 NER이 아니라, 명백히 회사명이 아닐
 * 후보(구분자가 없거나 길이가 비정상적인 제목)를 LLM 호출 전에 걸러내는 것이 목적이다.
 */

const DELIMITERS = [",", ":", "·", "|", "-", "…", "'", "’"];
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 20;

// 회사 소개성 헤드라인이 아닌 것으로 흔히 나타나는 섹션/포맷 키워드.
const NON_COMPANY_TITLE_KEYWORDS = [
  "인터뷰",
  "칼럼",
  "오피니언",
  "행사",
  "세미나",
  "채용",
  "공고",
  "주간",
  "위클리",
  "특집",
  "리포트",
];

export function extractCompanyNameCandidate(title: string): string | null {
  const trimmedTitle = title.trim();
  if (NON_COMPANY_TITLE_KEYWORDS.some((kw) => trimmedTitle.includes(kw))) {
    return null;
  }

  let cutIndex = -1;
  for (const delim of DELIMITERS) {
    const idx = trimmedTitle.indexOf(delim);
    if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) {
      cutIndex = idx;
    }
  }
  if (cutIndex === -1) return null;

  const candidate = trimmedTitle.slice(0, cutIndex).trim();
  if (candidate.length < MIN_NAME_LENGTH || candidate.length > MAX_NAME_LENGTH) return null;
  // 순수 숫자/기호만 있는 경우(날짜, 순번 등) 제외.
  if (!/[가-힣a-zA-Z]/.test(candidate)) return null;

  return candidate;
}
