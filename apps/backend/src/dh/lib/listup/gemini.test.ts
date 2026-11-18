import { afterEach, describe, expect, it, vi } from "vitest";

const { generateContent, clientOptions } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  clientOptions: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class GoogleGenAI {
    models = { generateContent };
    constructor(options: unknown) {
      clientOptions(options);
    }
  },
}));

vi.mock("./aiUsage", () => ({ recordAiUsage: vi.fn() }));

import {
  runRequiredWebSearch,
  runStructuredOutput,
  runWebSearch,
} from "./gemini";

describe("Gemini connection", () => {
  const vertexEnv = [
    "GOOGLE_GENAI_USE_VERTEXAI",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
  ];
  const response = { text: "{}", usageMetadata: {} };

  afterEach(() => {
    for (const name of vertexEnv) delete process.env[name];
  });

  it("connects with the API key by default", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockResolvedValue(response);
    clientOptions.mockClear();

    await runStructuredOutput("input", {});

    expect(clientOptions).toHaveBeenCalledWith({ apiKey: "test-key" });
  });

  it("connects to Vertex AI without the API key when switched on", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
    process.env.GOOGLE_CLOUD_PROJECT = "example-project";
    generateContent.mockResolvedValue(response);
    clientOptions.mockClear();

    await runStructuredOutput("input", {});

    expect(clientOptions).toHaveBeenCalledWith({
      vertexai: true,
      project: "example-project",
      location: "global",
    });
  });

  it("rejects Vertex AI calls without a project", async () => {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";

    await expect(runStructuredOutput("input", {})).rejects.toThrow(
      "GOOGLE_CLOUD_PROJECT is required",
    );
  });
});

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
  it("rejects a required search the model answered without searching, keeping its usage", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockResolvedValue({
      text: "Example Labs",
      candidates: [{ groundingMetadata: {} }],
      usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 },
    });
    const onComplete = vi.fn();

    await expect(
      runRequiredWebSearch("find Example Labs", { onComplete }),
    ).rejects.toThrow("did not execute the required Google Search");
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", inputTokens: 9, outputTokens: 4 }),
    );
  });

  it("returns grounded sources for a required search that ran", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockResolvedValue({
      text: "Example Labs",
      candidates: [
        {
          groundingMetadata: {
            webSearchQueries: ["Example Labs CEO"],
            groundingChunks: [
              { web: { uri: "https://example.com/team", title: "example.com" } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
    });

    await expect(runRequiredWebSearch("find Example Labs")).resolves.toEqual({
      text: "Example Labs",
      sourceUrls: ["https://example.com/team"],
      sourceTitles: ["example.com"],
      webSearchCallCount: 1,
      inputTokens: 12,
      outputTokens: 3,
    });
  });
});
