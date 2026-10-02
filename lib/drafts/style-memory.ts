import { NEGATIVE_REASONS, type FeedbackReason } from "@shared/contracts";
import type { StyleMemory } from "@/lib/ai/draft-prompt";
import { db } from "@/lib/db";

/**
 * "Feedback improves future drafts" — scoped to one workspace and one brand
 * profile. Nothing is trained; recent feedback becomes prompt guidance, and a
 * few drafts the team edited become style examples. Every query filters by
 * both workspaceId and brandProfileId, so no other tenant's data can appear.
 */

const INSTRUCTION_FOR: Partial<Record<FeedbackReason, string>> = {
  too_long: "Keep replies shorter than you otherwise would.",
  too_salesy: "Avoid a promotional tone; mention the business only when it directly helps.",
  off_topic: "Stay tightly on the specific question or point being made.",
  wrong_tone: "Match the profile's voice more closely.",
  inaccurate: "Be conservative: rely strictly on the verified facts.",
  too_generic: "Be more specific to the details of the conversation.",
};

const MIN_OCCURRENCES = 2;
const RECENT_FEEDBACK = 30;
const MAX_EXAMPLES = 3;
const EXAMPLE_MAX_CHARS = 600;

/** Turns counts of negative feedback reasons into prompt instructions. */
export function styleInstructionsFromReasons(reasons: string[]): string[] {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return NEGATIVE_REASONS.filter((reason) => (counts.get(reason) ?? 0) >= MIN_OCCURRENCES)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .map((reason) => INSTRUCTION_FOR[reason])
    .filter((line): line is string => Boolean(line));
}

export async function loadStyleMemory(
  workspaceId: string,
  brandProfileId: string
): Promise<StyleMemory> {
  const [feedback, edited] = await Promise.all([
    db.draftFeedback.findMany({
      where: { workspaceId, rating: "DOWN", draft: { workspaceId, brandProfileId } },
      orderBy: { createdAt: "desc" },
      take: RECENT_FEEDBACK,
      select: { reasons: true },
    }),
    db.draft.findMany({
      where: {
        workspaceId,
        brandProfileId,
        editedAt: { not: null },
        feedback: { none: { rating: "DOWN" } },
      },
      orderBy: { editedAt: "desc" },
      take: MAX_EXAMPLES * 3,
      select: { generatedText: true, currentText: true },
    }),
  ]);

  const examples = edited
    .filter((draft) => draft.currentText.trim() && draft.currentText !== draft.generatedText)
    .slice(0, MAX_EXAMPLES)
    .map((draft) => draft.currentText.slice(0, EXAMPLE_MAX_CHARS));

  return {
    instructions: styleInstructionsFromReasons(feedback.flatMap((row) => row.reasons)),
    examples,
  };
}
