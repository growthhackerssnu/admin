import { describe, expect, it, vi } from "vitest";

const { createResponse } = vi.hoisted(() => ({ createResponse: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create: createResponse };
    beta = { responses: { create: createResponse } };
  },
}));

import { runStructuredOutput, runWebSearch } from "./openaiWebSearch";

describe("OpenAI web search", () => {
  it("uses the Responses web_search tool and records returned sources and usage", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    createResponse.mockResolvedValue({
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            sources: [
              { type: "url", url: "https://example.com" },
              { type: "url", url: "https://example.com" },
            ],
          },
        },
        {
          type: "message",
          content: [{ type: "output_text", text: "Example Labs" }],
        },
      ],
      usage: { input_tokens: 12, output_tokens: 3 },
    });

    const onComplete = vi.fn();
    await expect(
      runWebSearch("find Example Labs", { onComplete }),
    ).resolves.toEqual({
      text: "Example Labs",
      sourceUrls: ["https://example.com"],
      webSearchCallCount: 1,
      inputTokens: 12,
      outputTokens: 3,
    });
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        model: "gpt-6-luna",
        inputTokens: 12,
        outputTokens: 3,
        webSearchCallCount: 1,
      }),
    );
    expect(createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-6-luna",
        reasoning: { effort: "none" },
        tool_choice: "required",
        max_tool_calls: 1,
        parallel_tool_calls: false,
        tools: [{ type: "web_search", search_context_size: "low" }],
        include: ["web_search_call.action.sources"],
      }),
    );
  });

  it("uses no web-search tool for structured outreach-style generation", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    createResponse.mockResolvedValue({
      output_text: '{"topic":"test"}',
      usage: { input_tokens: 7, output_tokens: 2 },
    });

    await expect(
      runStructuredOutput("write slots", {
        type: "object",
        additionalProperties: false,
        required: ["topic"],
        properties: { topic: { type: "string" } },
      }),
    ).resolves.toEqual({
      value: { topic: "test" },
      inputTokens: 7,
      outputTokens: 2,
    });
    expect(createResponse).toHaveBeenCalledWith(
      expect.not.objectContaining({ tools: expect.anything() }),
    );
  });
});
