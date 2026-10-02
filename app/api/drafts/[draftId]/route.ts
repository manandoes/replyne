import { NextResponse, type NextRequest } from "next/server";
import { updateDraftRequestSchema, type DraftResponse } from "@shared/contracts";
import { validateDraft } from "@shared/draft-validation";
import { forbidden, parseJsonBody, serverError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { loadAuthorizedDraft } from "@/lib/drafts/access";
import { rulesFromProfile, toDraftDto } from "@/lib/drafts/service";
import { can } from "@/lib/permissions";
import { authenticateRequest } from "@/lib/request-auth";

type Context = { params: Promise<{ draftId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { draftId } = await params;

  const loaded = await loadAuthorizedDraft(auth.user.id, draftId, "workspace.read");
  if (!loaded.ok) return loaded.response;
  return NextResponse.json<DraftResponse>({ draft: toDraftDto(loaded.draft) });
}

/** Save the author's edits. Validation is recomputed on the server. */
export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { draftId } = await params;

  const loaded = await loadAuthorizedDraft(auth.user.id, draftId, "draft.generate");
  if (!loaded.ok) return loaded.response;
  const { draft } = loaded;
  if (draft.createdById !== auth.user.id) return forbidden("Only the draft's author can edit it.");

  const body = await parseJsonBody(request, updateDraftRequestSchema);
  if (!body.ok) return body.response;

  try {
    const text = body.data.text;
    const firstEdit = draft.editedAt === null && text !== draft.currentText;
    const updated = await db.draft.update({
      where: { id: draft.id },
      data: {
        currentText: text,
        validationIssues: validateDraft(text, rulesFromProfile(draft.brandProfile)),
        ...(text !== draft.currentText ? { editedAt: new Date() } : {}),
      },
      include: { brandProfile: { select: { id: true, name: true } } },
    });
    if (firstEdit) {
      await recordAudit({
        action: "draft.edited",
        workspaceId: draft.workspaceId,
        actorUserId: auth.user.id,
        targetType: "draft",
        targetId: draft.id,
      });
    }
    return NextResponse.json<DraftResponse>({ draft: toDraftDto(updated) });
  } catch (error) {
    return serverError({ route: "PATCH /api/drafts/[draftId]", draftId }, error);
  }
}

/** Delete a draft (and its captured text and feedback) — author, or an admin. */
export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { draftId } = await params;

  const loaded = await loadAuthorizedDraft(auth.user.id, draftId, "workspace.read");
  if (!loaded.ok) return loaded.response;
  const { draft, actor } = loaded;
  if (draft.createdById !== auth.user.id && !can(actor.role, "draft.delete_any")) {
    return forbidden("Only the author or a workspace admin can delete this draft.");
  }

  try {
    await db.draft.delete({ where: { id: draft.id } });
    await recordAudit({
      action: "draft.deleted",
      workspaceId: draft.workspaceId,
      actorUserId: auth.user.id,
      targetType: "draft",
      targetId: draft.id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError({ route: "DELETE /api/drafts/[draftId]", draftId }, error);
  }
}
