import { describe, expect, it, vi } from "vitest";
import { buildGeminiRequest, createGeminiProvider } from "@/lib/ai/gemini";
import { AiProviderError, type GenerateJsonInput } from "@/lib/ai/provider";

const input: GenerateJsonInput = {
  system: "system",
  prompt: "prompt",
  jsonSchema: { type: "object" },
  maxOutputTokens: 100,
  temperature: 0.5,
  timeoutMs: 1000,
};

describe("Gemini provider", () => {
  it("never sends tools or tool configuration — the model can't act", () => {
    const request = buildGeminiRequest("gemini-flash-latest", input);
    const serialized = JSON.stringify(request);
    expect(serialized).not.toMatch(/"tools"|"toolConfig"|functionDeclarations/);
    expect(request.config?.responseMimeType).toBe("application/json");
    expect(request.config?.responseJsonSchema).toEqual({ type: "object" });
    expect(request.config?.systemInstruction).toBe("system");
  });

  it("parses JSON output and reports the model", async () => {
    const generateContent = vi.fn(async () => ({
      text: '{"reply":"hi","claims":[],"notes":""}',
      modelVersion: "gemini-x",
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    }));
    const provider = createGeminiProvider({ client: { models: { generateContent } } as never });
    const result = await provider.generateJson(input);
    expect(result).toEqual({
      raw: { reply: "hi", claims: [], notes: "" },
      model: "gemini-x",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("maps malformed output and upstream failures to typed errors", async () => {
    const malformed = createGeminiProvider({
      client: { models: { generateContent: async () => ({ text: "not json" }) } } as never,
    });
    await expect(malformed.generateJson(input)).rejects.toMatchObject({ kind: "invalid_output" });

    const failing = createGeminiProvider({
      client: {
        models: {
          generateContent: async () => {
            throw new Error("500 internal: secret details");
          },
        },
      } as never,
    });
    const error = await failing.generateJson(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).kind).toBe("upstream");
    expect((error as AiProviderError).message).not.toContain("secret");
  });

  it("refuses to run without an API key", async () => {
    const provider = createGeminiProvider({ apiKey: "" });
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(provider.generateJson(input)).rejects.toMatchObject({ kind: "not_configured" });
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
  });
});
