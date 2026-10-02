import { NextResponse, type NextRequest } from "next/server";
import { forbidden, serverError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { loadAuthorizedDraft } from "@/lib/drafts/access";
import { can } from "@/lib/permissions";
import { authenticateRequest } from "@/lib/request-auth";

type Context = { params: Promise<{ draftId: string }> };

/**
 * Deletes the captured Reddit text now instead of waiting for the retention
 * window. The draft, its source link, and feedback stay.
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { draftId } = await params;

  const loaded = await loadAuthorizedDraft(auth.user.id, draftId, "workspace.read");
  if (!loaded.ok) return loaded.response;
  const { draft, actor } = loaded;
  if (draft.createdById !== auth.user.id && !can(actor.role, "draft.delete_any")) {
    return forbidden("Only the author or a workspace admin can delete the source text.");
  }

  try {
    if (draft.capturedText !== null) {
      await db.draft.update({
        where: { id: draft.id },
        data: { capturedText: null, capturedTextPurgedAt: new Date() },
      });
      await recordAudit({
        action: "draft.source_deleted",
        workspaceId: draft.workspaceId,
        actorUserId: auth.user.id,
        targetType: "draft",
        targetId: draft.id,
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError({ route: "DELETE /api/drafts/[draftId]/captured-text", draftId }, error);
  }
}
