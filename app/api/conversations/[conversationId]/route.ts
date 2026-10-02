import { NextResponse, type NextRequest } from "next/server";
import { updateConversationSchema } from "@shared/contracts";
import { forbidden, notFound, parseJsonBody, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/request-auth";
import { scopedWhere } from "@/lib/tenant";
import { authorizeWorkspace } from "@/lib/workspace-access";
import { recordAudit } from "@/lib/audit";

/** Read, update, or delete a conversation. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { conversationId } = await params;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "conversation.read");
  if (!access.ok) return access.response;

  const conversation = await db.conversation.findFirst({
    where: scopedWhere(access.actor, { id: conversationId }),
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
  if (!conversation) return notFound("Conversation not found.");

  return NextResponse.json({ conversation });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { conversationId } = await params;
  const body = await parseJsonBody(request, updateConversationSchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "conversation.manage");
  if (!access.ok) return access.response;

  const existing = await db.conversation.findFirst({
    where: scopedWhere(access.actor, { id: conversationId }),
    select: { id: true, workspaceId: true },
  });
  if (!existing) return notFound("Conversation not found.");

  let validWatchListId: string | null = null;
  if (input.watchListId) {
    const wl = await db.watchList.findFirst({
      where: scopedWhere(access.actor, { id: input.watchListId, active: true }),
      select: { id: true },
    });
    if (!wl) return notFound("Watchlist not found or not active.");
    validWatchListId = wl.id;
  }

  try {
    const updated = await db.conversation.update({
      where: { id: conversationId },
      data: {
        title: input.title !== undefined ? (input.title.trim() || null) : undefined,
        author: input.author !== undefined ? (input.author.trim() || null) : undefined,
        summary: input.summary !== undefined ? (input.summary.trim() || null) : undefined,
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
      { action: "conversation.updated", workspaceId, actorUserId: auth.user.id, targetType: "Conversation", targetId: updated.id },
      db
    );
    return NextResponse.json({ conversation: updated });
  } catch (error) {
    return serverError({ route: "PATCH /api/conversations/[id]", userId: auth.user.id }, error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { conversationId } = await params;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  // Only admins can delete conversations.
  const access = await authorizeWorkspace(auth.user.id, workspaceId, "watchlist.manage");
  if (!access.ok) return access.response;

  const existing = await db.conversation.findFirst({
    where: scopedWhere(access.actor, { id: conversationId }),
    select: { id: true },
  });
  if (!existing) return notFound("Conversation not found.");

  try {
    await db.conversation.delete({ where: { id: conversationId } });
    await recordAudit(
      { action: "conversation.deleted", workspaceId, actorUserId: auth.user.id, targetType: "Conversation", targetId: existing.id },
      db
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return serverError({ route: "DELETE /api/conversations/[id]", userId: auth.user.id }, error);
  }
}
