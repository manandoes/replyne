import { NextResponse, type NextRequest } from "next/server";
import {
  createWatchListSchema,
  updateWatchListSchema,
  type WatchListSummary,
} from "@shared/contracts";
import { notFound, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/request-auth";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { scopedWhere } from "@/lib/tenant";
import { authorizeWorkspace } from "@/lib/workspace-access";
import { recordAudit } from "@/lib/audit";

async function listWatchLists(actor: { workspaceId: string }) {
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

/** List watchlists in the workspace. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "conversation.read");
  if (!access.ok) return access.response;

  const lists = await listWatchLists(access.actor);
  return NextResponse.json({ watchLists: lists.map((list) => ({
    id: list.id,
    name: list.name,
    type: list.type,
    terms: list.terms,
    subreddit: list.subreddit,
    active: list.active,
    conversationCount: list._count.conversations,
    createdAt: list.createdAt.toISOString(),
  })) });
}

/** Create a watchlist. Admin-only; members get 404 to avoid leaking role info. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(request, createWatchListSchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "watchlist.manage");
  if (!access.ok) return access.response;

  const limit = await consumeRateLimit(`watchlist:${workspaceId}`, LIMITS.watchlistCreatePerWorkspace);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds, "This workspace reached today's watchlist creation limit.");

  try {
    const list = await db.watchList.create({
      data: {
        workspaceId,
        name: input.name.trim(),
        type: input.type,
        terms: input.terms.map((t) => t.trim().toLowerCase()),
        subreddit: input.subreddit?.trim() || null,
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
      { action: "watchlist.created", workspaceId, actorUserId: auth.user.id, targetType: "WatchList", targetId: list.id },
      db
    );
    return NextResponse.json({ watchList: { ...list, conversationCount: 0 } }, { status: 201 });
  } catch (error) {
    return serverError({ route: "POST /api/watchlists", userId: auth.user.id }, error);
  }
}
