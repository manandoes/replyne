import type { ValidationIssue } from "@shared/draft-validation";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { WorkspaceActor } from "@/lib/workspace-access";

/** Dashboard reads of draft history. Every query is scoped to the actor's workspace. */

export type DraftFilters = {
  profileId: string | null;
  author: "all" | "me";
  feedback: "all" | "up" | "down" | "none";
  copied: "all" | "yes" | "no";
  cursor: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const single = Array.isArray(value) ? value[0] : value;
  return allowed.includes(single as T) ? (single as T) : fallback;
}

export function parseDraftFilters(params: SearchParams): DraftFilters {
  const single = (key: string) => {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    return first && first.length <= 64 ? first : null;
  };
  return {
    profileId: single("profile"),
    author: pick(params.author, ["all", "me"], "all"),
    feedback: pick(params.feedback, ["all", "up", "down", "none"], "all"),
    copied: pick(params.copied, ["all", "yes", "no"], "all"),
    cursor: single("cursor"),
  };
}

export const DRAFT_PAGE_SIZE = 25;

export async function listDrafts(actor: WorkspaceActor, filters: DraftFilters) {
  const rows = await db.draft.findMany({
    where: scopedWhere(actor, {
      ...(filters.profileId ? { brandProfileId: filters.profileId } : {}),
      ...(filters.author === "me" ? { createdById: actor.userId } : {}),
      ...(filters.feedback === "up" ? { feedback: { some: { rating: "UP" as const } } } : {}),
      ...(filters.feedback === "down" ? { feedback: { some: { rating: "DOWN" as const } } } : {}),
      ...(filters.feedback === "none" ? { feedback: { none: {} } } : {}),
      ...(filters.copied === "yes" ? { copyCount: { gt: 0 } } : {}),
      ...(filters.copied === "no" ? { copyCount: 0 } : {}),
    }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: DRAFT_PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      channel: true,
      currentText: true,
      copyCount: true,
      editedAt: true,
      aiProvider: true,
      sourceSubreddit: true,
      validationIssues: true,
      capturedTextPurgedAt: true,
      capturedTextExpiresAt: true,
      brandProfile: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      feedback: { select: { rating: true } },
    },
  });

  const hasMore = rows.length > DRAFT_PAGE_SIZE;
  const items = rows.slice(0, DRAFT_PAGE_SIZE).map((row) => ({
    ...row,
    blockingIssues: (row.validationIssues as ValidationIssue[]).filter((issue) => issue.severity === "block").length,
    up: row.feedback.filter((f) => f.rating === "UP").length,
    down: row.feedback.filter((f) => f.rating === "DOWN").length,
  }));
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function getDraftDetail(actor: WorkspaceActor, draftId: string) {
  return db.draft.findFirst({
    where: scopedWhere(actor, { id: draftId }),
    include: {
      brandProfile: true,
      createdBy: { select: { id: true, name: true } },
      feedback: {
        orderBy: { updatedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      regeneratedFrom: { select: { id: true, createdAt: true } },
      regenerations: { orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true } },
    },
  });
}

/** Captured text is usable until it's purged or its retention window ends. */
export function capturedTextAvailable(
  draft: { capturedTextPurgedAt: Date | null; capturedTextExpiresAt: Date },
  now = new Date()
): boolean {
  return draft.capturedTextPurgedAt === null && draft.capturedTextExpiresAt > now;
}
