import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { WorkspaceActor } from "@/lib/workspace-access";

export async function listWatchLists(actor: WorkspaceActor) {
  return await db.watchList.findMany({
    where: scopedWhere(actor, {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      terms: true,
      subreddit: true,
      active: true,
      createdAt: true,
      _count: { select: { conversations: true } },
    },
  });
}

export async function getWatchList(actor: WorkspaceActor, watchListId: string) {
  return await db.watchList.findFirst({
    where: scopedWhere(actor, { id: watchListId }),
    select: {
      id: true,
      name: true,
      type: true,
      terms: true,
      subreddit: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { conversations: true } },
    },
  });
}

export async function listConversations(
  actor: WorkspaceActor,
  options?: { watchListId?: string; sourceType?: string }
) {
  return await db.conversation.findMany({
    where: scopedWhere(actor, {
      ...(options?.watchListId ? { watchListId: options.watchListId } : {}),
      ...(options?.sourceType ? { sourceType: options.sourceType as any } : {}),
    }),
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      workspaceId: true,
      watchListId: true,
      sourceType: true,
      sourceUrl: true,
      sourceSubreddit: true,
      title: true,
      author: true,
      summary: true,
      textChars: true,
      textExpiresAt: true,
      textPurgedAt: true,
      lastCommentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getConversation(actor: WorkspaceActor, conversationId: string) {
  return await db.conversation.findFirst({
    where: scopedWhere(actor, { id: conversationId }),
    select: {
      id: true,
      workspaceId: true,
      watchListId: true,
      sourceType: true,
      sourceUrl: true,
      sourceSubreddit: true,
      text: true,
      textChars: true,
      textExpiresAt: true,
      textPurgedAt: true,
      title: true,
      author: true,
      summary: true,
      lastCommentAt: true,
      createdAt: true,
      updatedAt: true,
      opportunities: {
        select: { id: true, title: true, stage: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

export async function listOpportunities(actor: WorkspaceActor, options?: { stage?: string }) {
  return await db.opportunity.findMany({
    where: scopedWhere(actor, {
      ...(options?.stage ? { stage: options.stage as any } : {}),
    }),
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      title: true,
      stage: true,
      notes: true,
      lastContactAt: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
      conversation: { select: { id: true, title: true, sourceUrl: true } },
    },
  });
}

export async function getOpportunity(actor: WorkspaceActor, opportunityId: string) {
  return await db.opportunity.findFirst({
    where: scopedWhere(actor, { id: opportunityId }),
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      title: true,
      stage: true,
      notes: true,
      lastContactAt: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
      conversation: {
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          sourceType: true,
          author: true,
          summary: true,
          text: true,
          textChars: true,
          textExpiresAt: true,
          textPurgedAt: true,
          createdAt: true,
        },
      },
    },
  });
}

/** Pipeline summary: count of opportunities by stage. */
export async function opportunityPipelineSummary(actor: WorkspaceActor) {
  return await db.opportunity.groupBy({
    by: ["stage"],
    where: scopedWhere(actor, {}),
    _count: { _all: true },
  });
}
