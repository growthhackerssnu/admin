import { anthropic, SOURCING_MODEL } from "../../lib/anthropic";
import type { RawCandidate } from "./sourceFeeds";

export type CriteriaSnapshot = {
  industry: string;
  fundingStage: string;
  headcountMin: number;
  headcountMax: number;
};

export type CandidateEvaluation = {
  isCompany: boolean;
  domain: string | null;
  industry: string | null;
  fundingStage: string | null;
  employeeCount: number | null;
  fitScore: number;
  recommendationReason: string;
  uncertainty: string | null;
};

const SYSTEM_PROMPT = `당신은 스타트업 산학협력 대상 기업을 평가하는 리서치 보조원입니다.
주어진 회사명 후보에 대해 web_search 도구로 공개된 정보를 찾아 아래를 확인하세요:
1. 실제로 존재하는 회사가 맞는지 (사람 이름, 행사명, 일반 명사 등은 회사가 아님)
2. 공식 홈페이지 도메인
3. 업종
4. 투자 단계(예: Seed, Series A, Series B 등 — 공개된 보도자료 기준)
5. 대략적인 임직원 수 (채용공고, 회사 소개 페이지, 뉴스 등에서 추정 가능한 범위)

확인한 사실을 주어진 채용 조건과 비교해 fitScore(0.0~1.0)를 매기세요.
정보를 찾지 못했거나 출처가 불확실하면 절대 추측하지 말고 uncertainty에 명시하며 fitScore를 낮추세요.

검색이 끝나면 다른 설명 없이 아래 JSON 스키마 그대로 최종 답변으로만 출력하세요(마크다운 코드블록 금지):
{
  "isCompany": boolean,
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
    (v.domain === null || typeof v.domain === "string") &&
    (v.industry === null || typeof v.industry === "string") &&
    (v.fundingStage === null || typeof v.fundingStage === "string") &&
    (v.employeeCount === null || typeof v.employeeCount === "number") &&
    typeof v.fitScore === "number" &&
    typeof v.recommendationReason === "string" &&
    (v.uncertainty === null || typeof v.uncertainty === "string")
  );
}

/** web_search 도구로 후보 회사를 조사하고, 주어진 기준 대비 적합도를 평가한다. */
export async function evaluateCandidate(
  candidate: RawCandidate,
  criteria: CriteriaSnapshot,
): Promise<CandidateEvaluation | null> {
  const userPrompt = `회사명 후보: "${candidate.name}"
출처 기사 제목: "${candidate.sourceTitle}"
출처 URL: ${candidate.sourceUrl}

목표 조건:
- 업종: ${criteria.industry}
- 투자 단계: ${criteria.fundingStage}
- 임직원 수: ${criteria.headcountMin}~${criteria.headcountMax}명`;

  try {
    const response = await anthropic.messages.create({
      model: SOURCING_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
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
