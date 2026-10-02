import { NextResponse, type NextRequest } from "next/server";
import type { ValidationIssue } from "@shared/draft-validation";
import { serverError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { loadAuthorizedDraft } from "@/lib/drafts/access";
import { authenticateRequest } from "@/lib/request-auth";

type Context = { params: Promise<{ draftId: string }> };

/**
 * Records that the user copied the draft. Copying is the last step the product
 * observes; whether the reply was posted on Reddit is never assumed.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { draftId } = await params;

  const loaded = await loadAuthorizedDraft(auth.user.id, draftId, "draft.generate");
  if (!loaded.ok) return loaded.response;
  const { draft } = loaded;

  try {
    const updated = await db.draft.update({
      where: { id: draft.id },
      data: { copyCount: { increment: 1 }, lastCopiedAt: new Date() },
      select: { copyCount: true },
    });
    const issues = draft.validationIssues as ValidationIssue[];
    await recordAudit({
      action: "draft.copied",
      workspaceId: draft.workspaceId,
      actorUserId: auth.user.id,
      targetType: "draft",
      targetId: draft.id,
      metadata: {
        edited: draft.editedAt !== null,
        blockingIssues: issues.filter((issue) => issue.severity === "block").length,
      },
    });
    return NextResponse.json({ copyCount: updated.copyCount });
  } catch (error) {
    return serverError({ route: "POST /api/drafts/[draftId]/copy", draftId }, error);
  }
}
