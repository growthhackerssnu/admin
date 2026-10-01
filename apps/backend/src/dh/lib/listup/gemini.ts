import { GoogleGenAI } from "@google/genai";
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

function client() {
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

function interactionUsageOf(usage?: {
  total_input_tokens?: number;
  total_tool_use_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
}) {
  return {
    inputTokens:
      (usage?.total_input_tokens ?? 0) +
      (usage?.total_tool_use_tokens ?? 0),
    outputTokens:
      (usage?.total_output_tokens ?? 0) +
      (usage?.total_thought_tokens ?? 0),
  };
}

type CallOptions = { onComplete?: (metric: AiCallMetric) => void };

export async function runWebSearch(
  input: string,
  options: CallOptions = {},
): Promise<WebSearchResult> {
  const startedMs = performance.now();
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
    const usage = usageOf(response);
    const result = {
      text: response.text ?? "",
      sourceUrls,
      ...(sourceTitles.length ? { sourceTitles } : {}),
      webSearchCallCount: grounding?.webSearchQueries?.length ?? 0,
      ...usage,
    };
    options.onComplete?.({
      status: "succeeded",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      ...usage,
      webSearchCallCount: result.webSearchCallCount,
    });
    return result;
  } catch (error) {
    options.onComplete?.({
      status: "failed",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Uses the Interactions API for workflows where a skipped search must reject
 * the attempt. `tool_choice: "any"` is not usable with Gemini Google Search:
 * it can enter an unbounded tool-call loop. We therefore use `auto` and
 * require at least one returned `google_search_call` before accepting output.
 */
export async function runRequiredWebSearch(
  input: string,
  options: CallOptions = {},
): Promise<WebSearchResult> {
  const startedMs = performance.now();
  try {
    const response = await client().interactions.create({
      model: LISTUP_GEMINI_MODEL,
      input,
      tools: [{ type: "google_search" }],
      generation_config: { tool_choice: "auto" },
    });
    const steps = response.steps ?? [];
    const webSearchCallCount = steps.filter(
      (step) => step.type === "google_search_call",
    ).length;
    if (!webSearchCallCount) {
      throw new Error("Gemini did not execute the required Google Search.");
    }
    const textBlocks = steps.flatMap((step) =>
      step.type === "model_output"
        ? (step.content ?? []).filter((content) => content.type === "text")
        : [],
    );
    const sources = textBlocks
      .flatMap((content) => content.annotations ?? [])
      .flatMap((annotation) =>
        annotation.type === "url_citation" && annotation.url
          ? [{ url: annotation.url, title: annotation.title ?? "" }]
          : [],
      )
      .filter((source) => isHttpUrl(source.url));
    const sourceUrls = [...new Set(sources.map((source) => source.url))];
    const sourceTitles = [
      ...new Set(sources.map((source) => source.title).filter(Boolean)),
    ];
    const usage = interactionUsageOf(response.usage);
    const result = {
      text:
        response.output_text ??
        textBlocks.map((content) => content.text).join("\n"),
      sourceUrls,
      ...(sourceTitles.length ? { sourceTitles } : {}),
      webSearchCallCount,
      ...usage,
    };
    options.onComplete?.({
      status: "succeeded",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      ...usage,
      webSearchCallCount,
    });
    return result;
  } catch (error) {
    options.onComplete?.({
      status: "failed",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
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
    options.onComplete?.({
      status: "succeeded",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      ...usage,
      webSearchCallCount: 0,
    });
    return result;
  } catch (error) {
    options.onComplete?.({
      status: "failed",
      model: LISTUP_GEMINI_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
