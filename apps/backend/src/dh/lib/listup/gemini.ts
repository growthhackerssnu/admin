import { GoogleGenAI } from "@google/genai";
import { recordAiUsage } from "./aiUsage";
import type { AiCallMetric } from "./localObservability";

export const LISTUP_GEMINI_MODEL =
  process.env.LISTUP_GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export type WebSearchUsage = {
  webSearchCallCount: number;
  inputTokens: number;
  outputTokens: number;
};

export type WebSearchResult = WebSearchUsage & {
  text: string;
  sourceUrls: string[];
  sourceTitles?: string[];
};

// GOOGLE_GENAI_USE_VERTEXAI=true면 Vertex AI로 접속한다(서비스 계정 인증, 프로젝트 결제).
// 꺼져 있으면 AI Studio API 키로 접속한다. 변수를 지우면 예전 방식으로 돌아간다.
function client() {
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === "true") {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI calls.");
    }
    return new GoogleGenAI({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_LOCATION || "global",
    });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for Gemini calls.");
  return new GoogleGenAI({ apiKey });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function usageOf(response: {
  usageMetadata?: {
    promptTokenCount?: number;
    toolUsePromptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}) {
  const usage = response.usageMetadata;
  return {
    inputTokens:
      (usage?.promptTokenCount ?? 0) + (usage?.toolUsePromptTokenCount ?? 0),
    outputTokens:
      (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}

type CallOptions = { onComplete?: (metric: AiCallMetric) => void };

// 호출자의 onComplete 앞에 사용량 기록을 끼운다(관리자 비용 화면용).
function tracked(operation: string, options: CallOptions) {
  return (metric: AiCallMetric) => {
    recordAiUsage(operation, metric);
    options.onComplete?.(metric);
  };
}

export function runWebSearch(input: string, options: CallOptions = {}) {
  return groundedSearch(input, "web_search", false, options);
}

/**
 * Like runWebSearch, but rejects an answer the model gave without searching.
 * `tool_choice: "any"` is not usable with Gemini Google Search (it can loop),
 * so we let the model choose and reject when no search query ran.
 * The Interactions API is not used: on Vertex AI it returns no source URLs.
 */
export function runRequiredWebSearch(input: string, options: CallOptions = {}) {
  return groundedSearch(input, "required_web_search", true, options);
}

async function groundedSearch(
  input: string,
  operation: string,
  required: boolean,
  options: CallOptions,
): Promise<WebSearchResult> {
  const onComplete = tracked(operation, options);
  const startedMs = performance.now();
  // 검색 없이 답해서 거절한 호출도 토큰은 청구되므로 실패 기록에 사용량을 남긴다.
  let usage: ReturnType<typeof usageOf> | undefined;
  try {
    const response = await client().models.generateContent({
      model: LISTUP_GEMINI_MODEL,
      contents: input,
      config: { tools: [{ googleSearch: {} }] },
    });
    const grounding = response.candidates?.[0]?.groundingMetadata;
    const sources = (grounding?.groundingChunks ?? [])
      .flatMap((chunk) =>
        chunk.web?.uri
          ? [{ url: chunk.web.uri, title: chunk.web.title ?? "" }]
          : [],
      )
      .filter((source) => isHttpUrl(source.url));
    const sourceUrls = [...new Set(sources.map((source) => source.url))];
    const sourceTitles = [
      ...new Set(sources.map((source) => source.title).filter(Boolean)),
    ];
    usage = usageOf(response);
    const result = {
      text: response.text ?? "",
      sourceUrls,
      ...(sourceTitles.length ? { sourceTitles } : {}),
      webSearchCallCount: grounding?.webSearchQueries?.length ?? 0,
      ...usage,
    };
    if (required && !result.webSearchCallCount) {
      throw new Error("Gemini did not execute the required Google Search.");
    }
    onComplete({
      status: "succeeded",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      ...usage,
      webSearchCallCount: result.webSearchCallCount,
    });
    return result;
  } catch (error) {
    onComplete({
      status: "failed",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      ...usage,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function runStructuredOutput<T>(
  input: string,
  schema: Record<string, unknown>,
  options: CallOptions = {},
) {
  const onComplete = tracked("structured_output", options);
  const startedMs = performance.now();
  try {
    const response = await client().models.generateContent({
      model: LISTUP_GEMINI_MODEL,
      contents: input,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
    const usage = usageOf(response);
    const result = {
      value: JSON.parse(response.text ?? "") as T,
      ...usage,
    };
    onComplete({
      status: "succeeded",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      ...usage,
      webSearchCallCount: 0,
    });
    return result;
  } catch (error) {
    onComplete({
      status: "failed",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
