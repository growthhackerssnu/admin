import { anthropic, SOURCING_MODEL } from "../../lib/anthropic";
import type { RawCandidate } from "./sourceFeeds";
import { buildSourcingSearchScope } from "./searchScope";

export type CriteriaSnapshot = {
  industry: string;
  fundingStage: string;
  headcountMin: number;
  headcountMax: number;
};

export type CandidateEvaluation = {
  isCompany: boolean;
  companyName: string | null;
  domain: string | null;
  industry: string | null;
  fundingStage: string | null;
  employeeCount: number | null;
  fitScore: number;
  recommendationReason: string;
  uncertainty: string | null;
};

const SYSTEM_PROMPT = `당신은 스타트업 산학협력 대상 기업을 평가하는 리서치 보조원입니다.
입력으로 주어지는 "회사명 후보"는 뉴스 헤드라인에서 규칙 기반으로 기계적으로 뽑아낸 것이라
실제 회사명이 아니라 기사 제목의 일부 설명 문구일 수 있습니다(예: "OO가 선정한 △△ 스타트업").
web_search 도구로 출처 기사와 회사명 후보를 함께 조사해 아래를 확인하세요:
1. 이 후보가 가리키는 실제 회사가 무엇인지, 그 회사의 정확한(정식) 이름
2. 실제로 존재하는 회사가 맞는지 (사람 이름, 행사명, 일반 명사 등은 회사가 아님)
3. 공식 홈페이지 도메인
4. 업종
5. 투자 단계(예: Seed, Series A, Series B 등 — 공개된 보도자료 기준)
6. 대략적인 임직원 수 (채용공고, 회사 소개 페이지, 뉴스 등에서 추정 가능한 범위)

검색 범위는 한국 스타트업 DB(혁신의숲·THE VC·넥스트유니콘·로켓펀치), 채용 플랫폼,
스타트업 전문 매체, 공공 기업정보 사이트와 출처 기사로 제한되어 있습니다.
이 범위 밖의 페이지는 검색 결과에 나오지 않으니, 회사 공식 홈페이지를 직접 찾으려 하지 말고
위 스타트업 DB의 기업 프로필에 적힌 홈페이지 주소를 읽어 도메인을 확인하세요.
투자 단계는 매체 보도자료와 THE VC, 임직원 수는 채용 플랫폼과 로켓펀치에서 확인하는 것이
가장 빠릅니다. 검색 횟수가 제한되어 있으니 회사명과 사이트를 함께 지정해 검색하세요.

확인한 사실을 주어진 채용 조건과 비교해 fitScore(0.0~1.0)를 매기세요.
정보를 찾지 못했거나 출처가 불확실하면 절대 추측하지 말고 uncertainty에 명시하며 fitScore를 낮추세요.

검색이 끝나면 다른 설명 없이 아래 JSON 스키마 그대로 최종 답변으로만 출력하세요(마크다운 코드블록 금지):
{
  "isCompany": boolean,
  "companyName": string | null,  // 확인된 정확한 회사명. isCompany가 true면 반드시 채울 것
  "domain": string | null,
  "industry": string | null,
  "fundingStage": string | null,
  "employeeCount": number | null,
  "fitScore": number,
  "recommendationReason": string,
  "uncertainty": string | null
}`;

function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isValidEvaluation(value: unknown): value is CandidateEvaluation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.isCompany === "boolean" &&
    (v.companyName === null || typeof v.companyName === "string") &&
    (v.domain === null || typeof v.domain === "string") &&
    (v.industry === null || typeof v.industry === "string") &&
    (v.fundingStage === null || typeof v.fundingStage === "string") &&
    (v.employeeCount === null || typeof v.employeeCount === "number") &&
    typeof v.fitScore === "number" &&
    typeof v.recommendationReason === "string" &&
    (v.uncertainty === null || typeof v.uncertainty === "string")
  );
}

function buildUserPrompt(candidate: RawCandidate, criteria: CriteriaSnapshot): string {
  return `회사명 후보: "${candidate.name}"
출처 기사 제목: "${candidate.sourceTitle}"
출처 URL: ${candidate.sourceUrl}

목표 조건:
- 업종: ${criteria.industry}
- 투자 단계: ${criteria.fundingStage}
- 임직원 수: ${criteria.headcountMin}~${criteria.headcountMax}명`;
}

/**
 * Claude에 web_search를 주고 한 번 평가시킨다.
 * allowedDomains가 null이면 범위 제한 없이(열린 웹) 검색한다.
 */
async function requestEvaluation(
  candidate: RawCandidate,
  userPrompt: string,
  allowedDomains: string[] | null,
  maxUses: number,
): Promise<CandidateEvaluation | null> {
  try {
    const response = await anthropic.messages.create({
      model: SOURCING_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: maxUses,
          ...(allowedDomains ? { allowed_domains: allowedDomains } : {}),
        },
      ],
    });

    const combinedText = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(combinedText);
    if (!isValidEvaluation(parsed)) {
      console.error(`[sourcing] evaluateCandidate: invalid JSON for "${candidate.name}"`, combinedText);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error(`[sourcing] evaluateCandidate failed for "${candidate.name}"`, err);
    return null;
  }
}

/**
 * web_search 도구로 후보 회사를 조사하고, 주어진 기준 대비 적합도를 평가한다.
 *
 * 1차 평가는 searchScope의 화이트리스트 안에서만 검색한다. 회사 공식 홈페이지는
 * 후보마다 달라 화이트리스트에 넣을 수 없으므로, "실존하는 회사는 맞는데 도메인을
 * 못 찾은" 경우에만 범위 제한 없이 한 번 더 검색한다. 도메인은 Company의 유니크 키이자
 * 쿨다운 게이팅의 기준이라 비어 있으면 후보가 통째로 버려지기 때문이다.
 *
 * 화이트리스트 안에서 "회사가 아니다"라는 결론이 나온 경우는 재검색하지 않는다.
 * 출처 기사 도메인이 항상 탐색 범위에 포함되므로, 그 판단의 1차 근거는 이미 읽은 상태다.
 */
export async function evaluateCandidate(
  candidate: RawCandidate,
  criteria: CriteriaSnapshot,
): Promise<CandidateEvaluation | null> {
  const userPrompt = buildUserPrompt(candidate, criteria);
  const scope = buildSourcingSearchScope(candidate.sourceUrl);

  const scoped = await requestEvaluation(candidate, userPrompt, scope, 3);
  if (scoped && (!scoped.isCompany || scoped.domain)) return scoped;

  console.warn(
    `[sourcing] "${candidate.name}": 범위 제한 검색으로 도메인 미확인 — 열린 웹으로 재시도`,
  );
  const openWeb = await requestEvaluation(candidate, userPrompt, null, 2);
  return openWeb ?? scoped;
}
