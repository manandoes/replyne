import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import {
  AiProviderError,
  type DraftModelProvider,
  type GenerateJsonInput,
} from "@/lib/ai/provider";

const DEFAULT_MODEL = "gemini-flash-latest";

type GeminiClient = Pick<GoogleGenAI, "models">;

/**
 * Builds the request. Kept separate so tests can assert what is (and is not)
 * sent — in particular that no `tools` or `toolConfig` ever appear.
 */
export function buildGeminiRequest(
  model: string,
  input: GenerateJsonInput,
  abortSignal?: AbortSignal
): GenerateContentParameters {
  return {
    model,
    contents: [{ role: "user", parts: [{ text: input.prompt }] }],
    config: {
      systemInstruction: input.system,
      responseMimeType: "application/json",
      responseJsonSchema: input.jsonSchema,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      ...(abortSignal ? { abortSignal } : {}),
    },
  };
}

export function createGeminiProvider(options?: {
  apiKey?: string;
  model?: string;
  client?: GeminiClient;
}): DraftModelProvider {
  return {
    name: "gemini",
    async generateJson(input) {
      const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
      if (!options?.client && !apiKey) {
        throw new AiProviderError("not_configured", "GEMINI_API_KEY is not set.");
      }
      const client: GeminiClient = options?.client ?? new GoogleGenAI({ apiKey });
      const model = options?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.timeoutMs);
      try {
        const response = await client.models.generateContent(
          buildGeminiRequest(model, input, controller.signal)
        );
        const text = response.text;
        if (!text) throw new AiProviderError("invalid_output", "The model returned no text.");
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new AiProviderError("invalid_output", "The model returned malformed JSON.");
        }
        return {
          raw,
          model: response.modelVersion ?? model,
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount ?? null,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
          },
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (controller.signal.aborted) {
          throw new AiProviderError("timeout", "The AI provider took too long to respond.");
        }
        throw new AiProviderError("upstream", "The AI provider returned an error.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
