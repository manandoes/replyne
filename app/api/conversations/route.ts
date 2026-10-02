import { NextResponse, type NextRequest } from "next/server";
import {
  createConversationSchema,
  updateConversationSchema,
  type ConversationSummary,
} from "@shared/contracts";
import { capturedTextRetentionHours } from "@/lib/config";
import { forbidden, notFound, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/request-auth";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { scopedWhere } from "@/lib/tenant";
import { authorizeWorkspace } from "@/lib/workspace-access";
import { recordAudit } from "@/lib/audit";

const TEXT_RETENTION_MS = capturedTextRetentionHours() * 3_600_000;

function toSummary(c: {
  id: string;
  workspaceId: string;
  watchListId: string | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceSubreddit: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  textChars: number;
  textExpiresAt: Date;
  textPurgedAt: Date | null;
  lastCommentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ConversationSummary {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    watchListId: c.watchListId,
    sourceType: c.sourceType as ConversationSummary["sourceType"],
    sourceUrl: c.sourceUrl,
    sourceSubreddit: c.sourceSubreddit,
    title: c.title,
    author: c.author,
    summary: c.summary,
    textAvailable: c.textChars > 0 && !c.textPurgedAt,
    lastCommentAt: c.lastCommentAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** List conversations, optionally filtered by watchlist and/or source type. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "conversation.read");
  if (!access.ok) return access.response;

  const watchListId = request.nextUrl.searchParams.get("watchListId") || undefined;
  const sourceType = request.nextUrl.searchParams.get("sourceType") || undefined;

  const conversations = await db.conversation.findMany({
    where: scopedWhere(access.actor, {
      ...(watchListId ? { watchListId } : {}),
      ...(sourceType ? { sourceType: sourceType as any } : {}),
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

  return NextResponse.json({ conversations: conversations.map(toSummary) });
}

/** Create a conversation (manual paste). */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(request, createConversationSchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "conversation.manage");
  if (!access.ok) return access.response;

  const limit = await consumeRateLimit(`conversation:user:${auth.user.id}`, LIMITS.conversationCreatePerUser);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds, "You're adding conversations quickly — wait a moment.");

  // Validate watchlist ownership if provided.
  let validWatchListId: string | null = null;
  if (input.watchListId) {
    const wl = await db.watchList.findFirst({
      where: scopedWhere(access.actor, { id: input.watchListId, active: true }),
      select: { id: true },
    });
    if (!wl) return notFound("Watchlist not found or not active.");
    validWatchListId = wl.id;
  }

  const sourceUrl = input.sourceUrl?.trim() || null;
  // Extract subreddit from URL if provided.
  let sourceSubreddit: string | null = null;
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      const match = url.pathname.match(/^\/r\/([^/]+)/);
      if (match) sourceSubreddit = match[1] ?? null;
    } catch {
      // ignore malformed URLs
    }
  }

  const text = input.text?.trim() || null;
  const textChars = text?.length ?? 0;

  try {
    const conversation = await db.conversation.create({
      data: {
        workspaceId,
        sourceType: input.sourceType,
        sourceUrl,
        sourceSubreddit,
        text: text ? text.slice(0, 8000) : null,
        textChars,
        textExpiresAt: new Date(Date.now() + TEXT_RETENTION_MS),
        title: input.title?.trim() || null,
        author: input.author?.trim() || null,
        watchListId: validWatchListId,
      },
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
    await recordAudit(
      { action: "conversation.created", workspaceId, actorUserId: auth.user.id, targetType: "Conversation", targetId: conversation.id },
      db
    );
    return NextResponse.json({ conversation: toSummary(conversation) }, { status: 201 });
  } catch (error) {
    return serverError({ route: "POST /api/conversations", userId: auth.user.id }, error);
  }
}
