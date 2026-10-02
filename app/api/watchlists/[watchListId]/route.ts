import { NextResponse, type NextRequest } from "next/server";
import { updateWatchListSchema, type WatchListSummary } from "@shared/contracts";
import { forbidden, notFound, parseJsonBody, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/request-auth";
import { scopedWhere } from "@/lib/tenant";
import { authorizeWorkspace } from "@/lib/workspace-access";
import { recordAudit } from "@/lib/audit";

/** Read or update a watchlist. Admin-only for writes. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ watchListId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { watchListId } = await params;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "conversation.read");
  if (!access.ok) return access.response;

  const list = await db.watchList.findFirst({
    where: scopedWhere(access.actor, { id: watchListId }),
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
  if (!list) return notFound("Watchlist not found.");

  return NextResponse.json({
    watchList: {
      id: list.id,
      name: list.name,
      type: list.type,
      terms: list.terms,
      subreddit: list.subreddit,
      active: list.active,
      conversationCount: list._count.conversations,
      createdAt: list.createdAt.toISOString(),
    } as WatchListSummary,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ watchListId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { watchListId } = await params;
  const body = await parseJsonBody(request, updateWatchListSchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "watchlist.manage");
  if (!access.ok) return access.response;

  const existing = await db.watchList.findFirst({
    where: scopedWhere(access.actor, { id: watchListId }),
    select: { _count: { select: { conversations: true } } },
  });
  if (!existing) return notFound("Watchlist not found.");

  try {
    const updated = await db.watchList.update({
      where: { id: watchListId },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        terms: input.terms !== undefined ? input.terms.map((t) => t.trim().toLowerCase()) : undefined,
        subreddit: input.subreddit !== undefined ? (input.subreddit.trim() || null) : undefined,
        active: input.active !== undefined ? input.active : undefined,
      },
      select: {
        id: true,
        name: true,
        type: true,
        terms: true,
        subreddit: true,
        active: true,
        createdAt: true,
      },
    });
    await recordAudit(
      { action: "watchlist.updated", workspaceId, actorUserId: auth.user.id, targetType: "WatchList", targetId: updated.id },
      db
    );
    return NextResponse.json({ watchList: {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      terms: updated.terms,
      subreddit: updated.subreddit,
      active: updated.active,
      conversationCount: existing._count.conversations,
      createdAt: updated.createdAt.toISOString(),
    } as WatchListSummary });
  } catch (error) {
    return serverError({ route: "PATCH /api/watchlists/[id]", userId: auth.user.id }, error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ watchListId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { watchListId } = await params;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "watchlist.manage");
  if (!access.ok) return access.response;

  const existing = await db.watchList.findFirst({
    where: scopedWhere(access.actor, { id: watchListId }),
    select: { id: true, name: true },
  });
  if (!existing) return notFound("Watchlist not found.");

  try {
    // Detach conversations rather than cascade-delete them — conversations are
    // owned by the workspace and may still be useful without a watchlist.
    await db.conversation.updateMany({
      where: { watchListId },
      data: { watchListId: null },
    });
    await db.watchList.delete({ where: { id: watchListId } });
    await recordAudit(
      { action: "watchlist.deleted", workspaceId, actorUserId: auth.user.id, targetType: "WatchList", targetId: existing.id },
      db
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return serverError({ route: "DELETE /api/watchlists/[id]", userId: auth.user.id }, error);
  }
}
