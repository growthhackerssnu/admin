import { anthropic, SOURCING_MODEL } from "../../lib/anthropic";

export type ReplyIntent = "INTERESTED" | "NEEDS_INFO" | "DECLINED" | "OUT_OF_OFFICE" | "WRONG_PERSON" | "OTHER";

export type ReplyClassification = {
  intent: ReplyIntent;
  draftBody: string;
};

const INTENT_GUIDE = `- INTERESTED: 관심을 보이며 다음 단계(미팅, 통화 등)를 원하는 경우
- NEEDS_INFO: 더 자세한 정보(제안서, 학회 소개 등)를 요청하는 경우
- DECLINED: 명확히 거절하는 경우
- OUT_OF_OFFICE: 부재중 자동응답 등 본인이 직접 쓴 답장이 아닌 경우
- WRONG_PERSON: 담당자가 아니라며 다른 사람/부서를 안내하는 경우
- OTHER: 위 어디에도 뚜렷이 속하지 않는 경우`;

const SYSTEM_PROMPT = `당신은 대학 산학협력 학회의 아웃리치 담당자를 돕는 보조원입니다.
기업 담당자로부터 받은 답장 원문을 분석해 의도를 아래 중 하나로 분류하고,
그 의도에 맞는 답신 초안을 한국 비즈니스 이메일/메신저 어투로 작성하세요.

의도 분류 기준:
${INTENT_GUIDE}

답신 초안 작성 지침:
- INTERESTED: 감사 인사 + 미팅 일정 조율을 위한 구체적 제안(예: 가능한 시간대 2~3개 요청)
- NEEDS_INFO: 요청받은 정보를 보내겠다는 답변 + 추가로 필요한 정보가 있는지 확인
- DECLINED: 정중한 감사 인사로 마무리, 재접촉 여지를 남기되 부담 주지 않기
- OUT_OF_OFFICE: 복귀 예정일이 언급됐다면 그 이후 다시 연락하겠다는 짧은 메모
- WRONG_PERSON: 안내받은 담당자/부서로 다시 연락하겠다는 감사 인사
- OTHER: 원문 맥락에 맞게 자연스럽게 대응

이메일 원문에 언급된 구체적 내용(날짜, 요청 사항 등)을 답신에 반영하세요.
다른 설명 없이 아래 JSON 스키마만 출력하세요(마크다운 코드블록 금지):
{
  "intent": "INTERESTED" | "NEEDS_INFO" | "DECLINED" | "OUT_OF_OFFICE" | "WRONG_PERSON" | "OTHER",
  "draftBody": string
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

const VALID_INTENTS: ReplyIntent[] = [
  "INTERESTED",
  "NEEDS_INFO",
  "DECLINED",
  "OUT_OF_OFFICE",
  "WRONG_PERSON",
  "OTHER",
];

function isValid(value: unknown): value is ReplyClassification {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.intent === "string" &&
    VALID_INTENTS.includes(v.intent as ReplyIntent) &&
    typeof v.draftBody === "string"
  );
}

export async function classifyAndDraftReply(params: {
  companyName: string;
  contactName: string;
  originalBody: string | null;
  incomingText: string;
}): Promise<ReplyClassification | null> {
  const userPrompt = `회사: ${params.companyName}
담당자: ${params.contactName}

우리가 먼저 보낸 메시지:
${params.originalBody ?? "(기록 없음)"}

담당자로부터 받은 답장 원문:
${params.incomingText}`;

  try {
    const response = await anthropic.messages.create({
      model: SOURCING_MODEL,
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(text);
    if (!isValid(parsed)) {
      console.error("[reply] classifyAndDraftReply: invalid JSON", text);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[reply] classifyAndDraftReply failed", err);
    return null;
  }
}
