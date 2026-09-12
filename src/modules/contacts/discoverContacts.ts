import { anthropic, SOURCING_MODEL } from "../../lib/anthropic";

export type ContactMethodType = "EMAIL" | "PHONE" | "LINKEDIN" | "OTHER";
export type RoleType = "DECISION_MAKER" | "PRACTITIONER" | "CHAMPION";

export type DiscoveredContactMethod = {
  type: ContactMethodType;
  value: string;
  confidence: number;
  sourceUrl: string;
};

export type DiscoveredEvidence = {
  factKey: string;
  factValue: string;
  sourceUrl: string;
  confidence: number;
};

export type DiscoveredContact = {
  roleType: RoleType;
  name: string;
  jobTitle: string | null;
  profileUrl: string | null;
  roleFitScore: number;
  contactabilityScore: number;
  recommendationReason: string;
  contactMethods: DiscoveredContactMethod[];
  evidence: DiscoveredEvidence[];
};

const SYSTEM_PROMPT = `당신은 B2B 아웃리치 대상 회사에서 연락할 담당자를 찾는 리서치 보조원입니다.
주어진 회사에 대해 web_search 도구로 아래 3가지 역할에 해당하는 사람을 각 최대 1명씩 찾으세요:
- DECISION_MAKER(의사결정권자): 대표, C-level, 사업 총괄 등 최종 결정권이 있는 사람
- PRACTITIONER(실무자): 데이터/개발/기획 등 실제 프로젝트를 실행할 실무 담당자
- CHAMPION(챔피언): 사내에서 이 제안을 지지해줄 가능성이 높은 사람(예: 데이터 관련 활동을 공개적으로 하는 직원)

중요한 제약:
- 링크드인 프로필은 절대 직접 접속/스크래핑하지 말고, web_search 검색 스니펫에 나온 정보만 사용하세요
  (예: "site:linkedin.com/in 회사명 대표" 같은 검색어의 결과 스니펫).
- 이메일 주소를 확실히 찾지 못했다면 지어내지 말고, 회사 공식 이메일 패턴이 다른 곳(채용공고,
  홈페이지 문의처 등)에서 확인된 경우에만 그 패턴을 근거로 추정하되 confidence를 낮게 매기세요.
- 실제로 찾지 못한 역할은 억지로 채우지 말고 배열에서 생략하세요(빈 배열도 허용).
- 부득이한 경우가 아니면 같은 사람을 두 역할에 중복 배정하지 말고, 역할마다 다른 사람을 찾으세요.
- "활발히 활동하는 정도" 같은 지표는 링크드인 API 없이는 알 수 없으므로, 대신 최근 인터뷰/블로그/
  컨퍼런스 발표 등 공개적으로 확인되는 신호를 contactabilityScore(0~1)의 근거로 쓰세요.
- 모든 사실 주장에는 evidence 배열에 factKey/factValue/sourceUrl/confidence를 남기세요.

검색이 끝나면 다른 설명 없이 아래 JSON 스키마 그대로 최종 답변으로만 출력하세요(마크다운 코드블록 금지):
{
  "contacts": [
    {
      "roleType": "DECISION_MAKER" | "PRACTITIONER" | "CHAMPION",
      "name": string,
      "jobTitle": string | null,
      "profileUrl": string | null,
      "roleFitScore": number,
      "contactabilityScore": number,
      "recommendationReason": string,
      "contactMethods": [{ "type": "EMAIL" | "PHONE" | "LINKEDIN" | "OTHER", "value": string, "confidence": number, "sourceUrl": string }],
      "evidence": [{ "factKey": string, "factValue": string, "sourceUrl": string, "confidence": number }]
    }
  ]
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

function isValidResult(value: unknown): value is { contacts: DiscoveredContact[] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.contacts);
}

export async function discoverContacts(params: {
  companyName: string;
  domain: string;
  industry: string | null;
}): Promise<DiscoveredContact[]> {
  const userPrompt = `회사명: ${params.companyName}
공식 도메인: ${params.domain}
업종: ${params.industry ?? "미확인"}`;

  try {
    const response = await anthropic.messages.create({
      model: SOURCING_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      // max_uses를 너무 크게 두면 Vercel 함수 실행 시간 제한(60초)에 걸릴 위험이 커진다.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    });

    const combinedText = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(combinedText);
    if (!isValidResult(parsed)) {
      console.error(`[contacts] discoverContacts: invalid JSON for "${params.companyName}"`, combinedText);
      return [];
    }
    return parsed.contacts;
  } catch (err) {
    console.error(`[contacts] discoverContacts failed for "${params.companyName}"`, err);
    return [];
  }
}
