import { anthropic, SOURCING_MODEL } from "../../lib/anthropic";

export type DraftSkeleton = {
  researchSummary: string;
  problemHypothesis: string;
  body: string;
};

export const PROPOSAL_PLACEHOLDER = "[[프로젝트 제안 — 담당자가 직접 작성]]";

const SYSTEM_PROMPT = `당신은 대학 산학협력 학회가 기업에 보낼 첫 아웃리치 메시지의 초안을 준비하는
보조원입니다. 주어진 회사·담당자 정보와 조사된 근거를 바탕으로 아래 세 가지를 작성하세요:

1. researchSummary: 이 회사와 담당자에 대해 파악한 핵심 사실을 3~5문장으로 요약.
2. problemHypothesis: 이 회사가 가질 법한 데이터/분석 관련 문제나 기회에 대한 가설.
   추측이라는 점을 문장에서 자연스럽게 드러내세요(단정하지 말 것).
3. body: 담당자에게 보낼 개인화된 아웃리치 메시지 초안. 인사, 왜 이 회사/담당자에게
   연락했는지(위 근거 활용), 학회 소개 한 줄을 포함하세요.

**절대 규칙**: body 안에 실제 프로젝트 제안 내용을 쓰지 마세요. 프로젝트를 제안할 자리에는
정확히 이 문자열을 그대로 넣으세요: "${PROPOSAL_PLACEHOLDER}"
이건 사람이 나중에 직접 채워 넣을 자리이며, 봇이 대신 제안 내용을 만들어내면 안 됩니다.

다른 설명 없이 아래 JSON 스키마만 출력하세요(마크다운 코드블록 금지):
{
  "researchSummary": string,
  "problemHypothesis": string,
  "body": string
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

function isValid(value: unknown): value is DraftSkeleton {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.researchSummary === "string" &&
    typeof v.problemHypothesis === "string" &&
    typeof v.body === "string"
  );
}

export async function generateDraftSkeleton(params: {
  companyName: string;
  industry: string | null;
  contactName: string;
  contactJobTitle: string | null;
  evidenceFacts: string[];
  referenceProjectTitles: string[];
}): Promise<DraftSkeleton | null> {
  const userPrompt = `회사: ${params.companyName} (업종: ${params.industry ?? "미확인"})
담당자: ${params.contactName}${params.contactJobTitle ? ` (${params.contactJobTitle})` : ""}

조사된 근거:
${params.evidenceFacts.length > 0 ? params.evidenceFacts.map((f) => `- ${f}`).join("\n") : "- (추가 근거 없음)"}

학회가 과거/현재 수행한 프로젝트 예시(참고용, body에 그대로 나열하지 말 것):
${params.referenceProjectTitles.length > 0 ? params.referenceProjectTitles.join(", ") : "(없음)"}`;

  try {
    const response = await anthropic.messages.create({
      model: SOURCING_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(text);
    if (!isValid(parsed)) {
      console.error("[drafting] generateDraftSkeleton: invalid JSON", text);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[drafting] generateDraftSkeleton failed", err);
    return null;
  }
}
