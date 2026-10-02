import type { DraftDto, DraftOptions } from "@shared/contracts";
import { describeSourceUrl } from "@shared/reddit-url";
import {
  validateDraft,
  type DraftRules,
  type IssueCode,
  type ValidationIssue,
} from "@shared/draft-validation";
import {
  buildDraftPrompt,
  draftOutputJsonSchema,
  draftOutputSchema,
  DRAFT_PROMPT_VERSION,
  type DraftOutput,
} from "@/lib/ai/draft-prompt";
import { AiProviderError, getAiProvider, type DraftModelProvider } from "@/lib/ai/provider";
import { recordAudit } from "@/lib/audit";
import { capturedTextRetentionHours } from "@/lib/config";
import { db } from "@/lib/db";
import type { BrandProfile, Draft } from "@/lib/generated/prisma/client";
import { loadStyleMemory } from "@/lib/drafts/style-memory";

const MAX_OUTPUT_TOKENS = 1_024;
const TEMPERATURE = 0.6;
const TIMEOUT_MS = 30_000;

/** Issues in fresh AI output that earn one automatic revision attempt. */
const REVISION_TRIGGERS = new Set<IssueCode>([
  "empty",
  "too_long",
  "link_not_allowed",
  "prohibited_claim",
  "evasion_claim",
  "guarantee",
  "personal_experience",
  "unsupported_claim",
  "missing_disclosure",
]);

export function rulesFromProfile(profile: BrandProfile): DraftRules {
  return {
    brandName: profile.brandName,
    facts: profile.facts,
    prohibitedClaims: profile.prohibitedClaims,
    linkPolicy: profile.linkPolicy,
    allowedLinkDomains: profile.allowedLinkDomains,
    disclosure: profile.disclosure,
  };
}

type StoredOptions = DraftOptions & { instruction?: string };

export function toDraftDto(draft: Draft & { brandProfile: { id: string; name: string } }): DraftDto {
  const options = draft.options as StoredOptions;
  return {
    id: draft.id,
    workspaceId: draft.workspaceId,
    brandProfile: { id: draft.brandProfile.id, name: draft.brandProfile.name },
    text: draft.currentText,
    generatedText: draft.generatedText,
    notes: draft.notes,
    issues: draft.validationIssues as ValidationIssue[],
    aiProvider: draft.aiProvider,
    model: draft.model,
    options: { tone: options.tone, length: options.length, brandMention: options.brandMention },
    sourceUrl: draft.sourceUrl,
    sourceSubreddit: draft.sourceSubreddit,
    capturedTextAvailable: draft.capturedText !== null,
    regeneratedFromId: draft.regeneratedFromId,
    createdAt: draft.createdAt.toISOString(),
    editedAt: draft.editedAt?.toISOString() ?? null,
    copyCount: draft.copyCount,
  };
}

async function callModel(
  provider: DraftModelProvider,
  prompt: { system: string; prompt: string }
): Promise<{ output: DraftOutput; model: string; inputTokens: number | null; outputTokens: number | null }> {
  const result = await provider.generateJson({
    ...prompt,
    jsonSchema: draftOutputJsonSchema,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    timeoutMs: TIMEOUT_MS,
  });
  const parsed = draftOutputSchema.safeParse(result.raw);
  if (!parsed.success) {
    throw new AiProviderError("invalid_output", "The model's response didn't match the expected format.");
  }
  return {
    output: parsed.data,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}

export type GenerateDraftInput = {
  userId: string;
  profile: BrandProfile;
  capturedText: string;
  sourceUrl: string | null | undefined;
  options: DraftOptions;
  channel: "extension" | "dashboard";
  instruction?: string;
  regeneratedFromId?: string;
};

/**
 * Generates, validates, and stores an AI-assisted draft. The caller has
 * already authorized `draft.generate` in `profile.workspaceId`.
 */
export async function generateDraft(
  input: GenerateDraftInput,
  deps: { provider?: DraftModelProvider; now?: Date } = {}
): Promise<DraftDto> {
  const provider = deps.provider ?? getAiProvider();
  const now = deps.now ?? new Date();
  const { profile } = input;
  const rules = rulesFromProfile(profile);
  const source = describeSourceUrl(input.sourceUrl);
  const styleMemory = await loadStyleMemory(profile.workspaceId, profile.id);

  const promptInput = {
    profile,
    styleMemory,
    options: input.options,
    capturedText: input.capturedText,
    sourceSubreddit: source?.subreddit ?? null,
    instruction: input.instruction,
  };

  const started = Date.now();
  let result = await callModel(provider, buildDraftPrompt(promptInput));
  let issues = validateDraft(result.output.reply, rules, result.output.claims);
  let revised = false;

  const triggers = issues.filter((issue) => REVISION_TRIGGERS.has(issue.code));
  if (triggers.length > 0) {
    revised = true;
    result = await callModel(
      provider,
      buildDraftPrompt({
        ...promptInput,
        revision: { previousReply: result.output.reply, issues: triggers },
      })
    );
    issues = validateDraft(result.output.reply, rules, result.output.claims);
  }

  const reply = result.output.reply.trim();
  const draft = await db.draft.create({
    data: {
      workspaceId: profile.workspaceId,
      brandProfileId: profile.id,
      createdById: input.userId,
      channel: input.channel === "dashboard" ? "DASHBOARD" : "EXTENSION",
      capturedText: input.capturedText,
      capturedTextChars: input.capturedText.length,
      capturedTextExpiresAt: new Date(now.getTime() + capturedTextRetentionHours() * 3_600_000),
      sourceUrl: source?.url ?? null,
      sourceSubreddit: source?.subreddit ?? null,
      options: { ...input.options, ...(input.instruction ? { instruction: input.instruction } : {}) },
      generatedText: reply,
      currentText: reply,
      notes: result.output.notes.trim(),
      validationIssues: issues,
      aiProvider: provider.name,
      model: result.model,
      promptVersion: DRAFT_PROMPT_VERSION,
      revised,
      regeneratedFromId: input.regeneratedFromId ?? null,
    },
    include: { brandProfile: { select: { id: true, name: true } } },
  });

  await recordAudit({
    action: input.regeneratedFromId ? "draft.regenerated" : "draft.generated",
    workspaceId: profile.workspaceId,
    actorUserId: input.userId,
    targetType: "draft",
    targetId: draft.id,
    metadata: {
      channel: input.channel,
      brandProfileId: profile.id,
      provider: provider.name,
      model: result.model,
      revised,
      issues: issues.length,
      blockingIssues: issues.filter((issue) => issue.severity === "block").length,
      latencyMs: Date.now() - started,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
  });

  return toDraftDto(draft);
}
