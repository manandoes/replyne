import type { DraftModelProvider, GenerateJsonInput } from "@/lib/ai/provider";

/**
 * Deterministic stand-in for development without an API key, and for tests.
 * Drafts it produces are labeled "Mock AI" everywhere they appear.
 *
 * `script` lets tests return specific outputs (e.g. a "compromised" model
 * response) to exercise validation independently of any real model.
 */
export function createMockProvider(
  script?: (input: GenerateJsonInput, call: number) => unknown
): DraftModelProvider & { calls: GenerateJsonInput[] } {
  const calls: GenerateJsonInput[] = [];
  return {
    name: "mock",
    calls,
    async generateJson(input) {
      calls.push(input);
      const raw = script ? script(input, calls.length) : defaultMockDraft(input.prompt);
      return { raw, model: "mock-draft-v1", usage: { inputTokens: null, outputTokens: null } };
    },
  };
}

function defaultMockDraft(prompt: string) {
  const firstFact = /^F1: (.+)$/m.exec(prompt)?.[1]?.trim();
  const reply = firstFact
    ? `Good question — disclosure: I'm on the team. ${firstFact} If you share a bit more about what you're trying to do, I'm happy to point you in the right direction.`
    : "Good question. If you share a bit more about what you're trying to do, I'm happy to point you in the right direction.";
  return {
    reply,
    claims: firstFact ? [{ text: firstFact, factIds: ["F1"] }] : [],
    notes: "Mock AI draft — set GEMINI_API_KEY on the server for real drafts.",
  };
}
