import type { AiProviderName } from "@shared/contracts";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { createMockProvider } from "@/lib/ai/mock";

/**
 * The only contract the drafting service has with an LLM: send a system
 * instruction and a prompt, receive JSON. Deliberately no tools, functions, or
 * credentials — a model cannot take any action through this interface.
 */
export type GenerateJsonInput = {
  system: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
};

export type GenerateJsonResult = {
  raw: unknown;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export interface DraftModelProvider {
  readonly name: AiProviderName;
  generateJson(input: GenerateJsonInput): Promise<GenerateJsonResult>;
}

export type AiProviderErrorKind = "not_configured" | "timeout" | "upstream" | "invalid_output";

export class AiProviderError extends Error {
  constructor(
    readonly kind: AiProviderErrorKind,
    message: string
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Picks the provider from the environment. Without a Gemini key, development
 * uses the mock (drafts are labeled "Mock AI"); production never silently
 * falls back — it reports "not configured".
 */
export function resolveAiProviderName(): AiProviderName | "unconfigured" {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configured === "mock") return "mock";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "mock";
}

export function getAiProvider(): DraftModelProvider {
  const name = resolveAiProviderName();
  if (name === "mock") return createMockProvider();
  if (name === "gemini") return createGeminiProvider();
  return {
    name: "gemini",
    async generateJson() {
      throw new AiProviderError("not_configured", "No AI provider is configured on the server.");
    },
  };
}
