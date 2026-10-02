import { NextResponse, type NextRequest } from "next/server";
import { updateOpportunitySchema, advanceOpportunitySchema } from "@shared/contracts";
import { forbidden, notFound, parseJsonBody, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/request-auth";
import { scopedWhere } from "@/lib/tenant";
import { authorizeWorkspace } from "@/lib/workspace-access";
import { recordAudit } from "@/lib/audit";
import { RESOLVED_STAGES } from "@shared/contracts";

/** Read, update, or advance an opportunity. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { opportunityId } = await params;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "opportunity.read");
  if (!access.ok) return access.response;

  const opportunity = await db.opportunity.findFirst({
    where: scopedWhere(access.actor, { id: opportunityId }),
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
  if (!opportunity) return notFound("Opportunity not found.");

  return NextResponse.json({ opportunity });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { opportunityId } = await params;
  const body = await parseJsonBody(request, updateOpportunitySchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "opportunity.manage");
  if (!access.ok) return access.response;

  const existing = await db.opportunity.findFirst({
    where: scopedWhere(access.actor, { id: opportunityId }),
    select: { id: true, workspaceId: true, stage: true },
  });
  if (!existing) return notFound("Opportunity not found.");

  const newStage = input.stage ?? existing.stage;
  const wasResolved = RESOLVED_STAGES.includes(existing.stage as any);
  const isNowResolved = RESOLVED_STAGES.includes(newStage as any);

  try {
    const updated = await db.opportunity.update({
      where: { id: opportunityId },
      data: {
        title: input.title !== undefined ? input.title.trim() : undefined,
        notes: input.notes !== undefined ? input.notes.trim() : undefined,
        stage: newStage,
        resolvedAt: isNowResolved && !wasResolved ? new Date() : undefined,
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
      { action: "opportunity.updated", workspaceId, actorUserId: auth.user.id, targetType: "Opportunity", targetId: updated.id },
      db
    );
    return NextResponse.json({ opportunity: { ...updated, stage: updated.stage as any } });
  } catch (error) {
    return serverError({ route: "PATCH /api/opportunities/[id]", userId: auth.user.id }, error);
  }
}

/** Advance the pipeline stage, optionally adding a contact note. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { opportunityId } = await params;
  const body = await parseJsonBody(request, advanceOpportunitySchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return notFound("workspaceId is required.");

  const access = await authorizeWorkspace(auth.user.id, workspaceId, "opportunity.manage");
  if (!access.ok) return access.response;

  const existing = await db.opportunity.findFirst({
    where: scopedWhere(access.actor, { id: opportunityId }),
    select: { id: true, workspaceId: true, stage: true, notes: true },
  });
  if (!existing) return notFound("Opportunity not found.");

  const wasResolved = RESOLVED_STAGES.includes(existing.stage as any);
  const isNowResolved = RESOLVED_STAGES.includes(input.stage as any);

  // Read current notes before the update so we can append without a self-reference.
  const currentNotes = existing.notes ?? "";

  try {
    const updated = await db.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: input.stage,
        lastContactAt: new Date(),
        contactedBy: auth.user.id,
        resolvedAt: isNowResolved && !wasResolved ? new Date() : isNowResolved ? undefined : null,
        resolvedBy: isNowResolved && !wasResolved ? auth.user.id : null,
        ...(input.note ? { notes: currentNotes + `\n${input.note.trim()}` } : {}),
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
      {
        action: "opportunity.stage_changed",
        workspaceId,
        actorUserId: auth.user.id,
        targetType: "Opportunity",
        targetId: updated.id,
        metadata: { fromStage: existing.stage, toStage: input.stage },
      },
      db
    );
    return NextResponse.json({ opportunity: { ...updated, stage: updated.stage as any } });
  } catch (error) {
    return serverError({ route: "POST /api/opportunities/[id]/advance", userId: auth.user.id }, error);
  }
}
