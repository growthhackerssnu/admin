import { describe, expect, it, vi } from "vitest";

const { generateContent, createInteraction } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  createInteraction: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class GoogleGenAI {
    models = { generateContent };
    interactions = { create: createInteraction };
  },
}));

import {
  runRequiredWebSearch,
  runStructuredOutput,
  runWebSearch,
} from "./gemini";

describe("Gemini Google Search", () => {
  it("records grounded sources, executed queries, and usage", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockResolvedValue({
      text: "Example Labs",
      candidates: [
        {
          groundingMetadata: {
            webSearchQueries: ["Example Labs", "Example Labs funding"],
            groundingChunks: [
              { web: { uri: "https://example.com" } },
              { web: { uri: "https://example.com" } },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 12,
        toolUsePromptTokenCount: 4,
        candidatesTokenCount: 3,
        thoughtsTokenCount: 2,
      },
    });

    const onComplete = vi.fn();
    await expect(runWebSearch("find Example Labs", { onComplete })).resolves.toEqual({
      text: "Example Labs",
      sourceUrls: ["https://example.com"],
      webSearchCallCount: 2,
      inputTokens: 16,
      outputTokens: 5,
    });
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        model: "gemini-3.5-flash-lite",
        inputTokens: 16,
        outputTokens: 5,
        webSearchCallCount: 2,
      }),
    );
    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-3.5-flash-lite",
      contents: "find Example Labs",
      config: { tools: [{ googleSearch: {} }] },
    });
  });

  it("uses JSON schema output without Google Search for non-search work", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["topic"],
      properties: { topic: { type: "string" } },
    };
    generateContent.mockResolvedValue({
      text: '{"topic":"test"}',
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
    });

    await expect(runStructuredOutput("write slots", schema)).resolves.toEqual({
      value: { topic: "test" },
      inputTokens: 7,
      outputTokens: 2,
    });
    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-3.5-flash-lite",
      contents: "write slots",
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
  });
  it("rejects an interaction that did not execute its required Google Search", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    createInteraction.mockResolvedValue({ steps: [], usage: {} });

    await expect(runRequiredWebSearch("find Example Labs")).rejects.toThrow(
      "did not execute the required Google Search",
    );
  });

  it("records an executed interaction search and its URL citations", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    createInteraction.mockResolvedValue({
      output_text: "Example Labs https://www.linkedin.com/in/jae-kim",
      steps: [
        { type: "google_search_call", id: "call-1", arguments: {} },
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: "Example Labs https://www.linkedin.com/in/jae-kim",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://www.linkedin.com/in/jae-kim",
                  title: "Jae Kim - LinkedIn",
                },
              ],
            },
          ],
        },
      ],
      usage: {
        total_input_tokens: 12,
        total_tool_use_tokens: 4,
        total_output_tokens: 3,
        total_thought_tokens: 2,
      },
    });

    await expect(runRequiredWebSearch("find Example Labs")).resolves.toEqual({
      text: "Example Labs https://www.linkedin.com/in/jae-kim",
      sourceUrls: ["https://www.linkedin.com/in/jae-kim"],
      sourceTitles: ["Jae Kim - LinkedIn"],
      webSearchCallCount: 1,
      inputTokens: 16,
      outputTokens: 5,
    });
    expect(createInteraction).toHaveBeenCalledWith({
      model: "gemini-3.5-flash-lite",
      input: "find Example Labs",
      tools: [{ type: "google_search" }],
      generation_config: { tool_choice: "auto" },
    });
  });
});
