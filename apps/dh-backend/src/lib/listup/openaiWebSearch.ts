import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/beta/responses/responses";
import type { AiCallMetric } from "./localObservability";

export const LISTUP_WEB_SEARCH_MODEL =
  process.env.LISTUP_WEB_SEARCH_MODEL ?? "gpt-6-luna";

export type WebSearchUsage = {
  webSearchCallCount: number;
  inputTokens: number;
  outputTokens: number;
};

export type WebSearchResult = WebSearchUsage & {
  text: string;
  sourceUrls: string[];
};

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for web search.");
  return new OpenAI({ apiKey });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function responseText(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
  )
    return response.output_text;
  if (
    !response ||
    typeof response !== "object" ||
    !("output" in response) ||
    !Array.isArray(response.output)
  )
    return "";
  return response.output
    .flatMap((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("content" in item) ||
        !Array.isArray(item.content)
      )
        return [];
      return item.content.flatMap((content: unknown) =>
        content &&
        typeof content === "object" &&
        "type" in content &&
        content.type === "output_text" &&
        "text" in content &&
        typeof content.text === "string"
          ? [content.text]
          : [],
      );
    })
    .join("\n");
}

// One Responses call is the cost boundary. The prompt asks for one focused
// lookup; the returned tool-call count is persisted for actual-cost auditing.
type CallOptions = { onComplete?: (metric: AiCallMetric) => void };

export async function runWebSearch(
  input: string,
  options: CallOptions = {},
): Promise<WebSearchResult> {
  const startedMs = performance.now();
  try {
    const request: ResponseCreateParamsNonStreaming = {
      model: LISTUP_WEB_SEARCH_MODEL,
      reasoning: { effort: "none" },
      tools: [{ type: "web_search", search_context_size: "low" }],
      tool_choice: "required",
      parallel_tool_calls: false,
      max_tool_calls: 1,
      include: ["web_search_call.action.sources"],
      store: false,
      input,
    };
    const response = await client().beta.responses.create(request);
    const calls = response.output.filter(
      (item) => item.type === "web_search_call",
    );
    const sourceUrls = [
      ...new Set(
        calls.flatMap((call) => {
          if (call.action.type === "search")
            return (call.action.sources ?? []).map((source) => source.url);
          if (call.action.type === "open_page" && call.action.url)
            return [call.action.url];
          if (call.action.type === "find_in_page") return [call.action.url];
          return [];
        }),
      ),
    ].filter(isHttpUrl);
    const result = {
      text: responseText(response),
      sourceUrls,
      webSearchCallCount: calls.length,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
    options.onComplete?.({
      status: "succeeded",
      model: LISTUP_WEB_SEARCH_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      webSearchCallCount: result.webSearchCallCount,
    });
    return result;
  } catch (error) {
    options.onComplete?.({
      status: "failed",
      model: LISTUP_WEB_SEARCH_MODEL,
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
    const response = await client().responses.create({
      model: LISTUP_WEB_SEARCH_MODEL,
      reasoning: { effort: "none" },
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "listup_research",
          strict: true,
          schema,
        },
      },
      input,
    });
    const result = {
      value: JSON.parse(response.output_text) as T,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
    options.onComplete?.({
      status: "succeeded",
      model: LISTUP_WEB_SEARCH_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      webSearchCallCount: 0,
    });
    return result;
  } catch (error) {
    options.onComplete?.({
      status: "failed",
      model: LISTUP_WEB_SEARCH_MODEL,
      durationMs: Math.round(performance.now() - startedMs),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
