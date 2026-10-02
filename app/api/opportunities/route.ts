import { NextResponse, type NextRequest } from "next/server";
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  advanceOpportunitySchema,
  type OpportunitySummary,
} from "@shared/contracts";
import { forbidden, notFound, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/request-auth";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { scopedWhere } from "@/lib/tenant";
import { authorizeWorkspace } from "@/lib/workspace-access";
import { recordAudit } from "@/lib/audit";

function toSummary(o: {
  id: string;
  workspaceId: string;
  conversationId: string;
  title: string;
  stage: string;
  notes: string;
  lastContactAt: Date | null;
  resolvedAt: Date | null;
  conversation: { id: string; title: string | null; sourceUrl: string | null };
  createdAt: Date;
  updatedAt: Date;
}): OpportunitySummary {
  return {
    id: o.id,
    workspaceId: o.workspaceId,
    conversationId: o.conversationId,
    title: o.title,
    stage: o.stage as OpportunitySummary["stage"],
    notes: o.notes,
    lastContactAt: o.lastContactAt?.toISOString() ?? null,
    resolvedAt: o.resolvedAt?.toISOString() ?? null,
    conversation: o.conversation,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** List opportunities, optionally filtered by stage. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "opportunity.read");
  if (!access.ok) return access.response;

  const stage = request.nextUrl.searchParams.get("stage") || undefined;

  const opportunities = await db.opportunity.findMany({
    where: scopedWhere(access.actor, {
      ...(stage ? { stage: stage as any } : {}),
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

  return NextResponse.json({ opportunities: opportunities.map(toSummary) });
}

/** Create an opportunity from a conversation. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(request, createOpportunitySchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "opportunity.manage");
  if (!access.ok) return access.response;

  const limit = await consumeRateLimit(`opportunity:${workspaceId}`, LIMITS.opportunityCreatePerWorkspace);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds, "This workspace reached today's opportunity creation limit.");

  // Validate conversation ownership.
  const conversation = await db.conversation.findFirst({
    where: scopedWhere(access.actor, { id: input.conversationId }),
    select: { id: true, workspaceId: true },
  });
  if (!conversation) return notFound("Conversation not found.");

  try {
    const opportunity = await db.opportunity.create({
      data: {
        workspaceId,
        conversationId: input.conversationId,
        title: input.title.trim(),
        notes: input.notes.trim(),
      },
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
    await recordAudit(
      { action: "opportunity.created", workspaceId, actorUserId: auth.user.id, targetType: "Opportunity", targetId: opportunity.id },
      db
    );
    return NextResponse.json({ opportunity: toSummary(opportunity) }, { status: 201 });
  } catch (error) {
    return serverError({ route: "POST /api/opportunities", userId: auth.user.id }, error);
  }
}
