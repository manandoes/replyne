import { NextResponse, type NextRequest } from "next/server";
import { feedbackRequestSchema, type FeedbackDto, type FeedbackReason } from "@shared/contracts";
import { parseJsonBody, serverError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { loadAuthorizedDraft } from "@/lib/drafts/access";
import { authenticateRequest } from "@/lib/request-auth";

type Context = { params: Promise<{ draftId: string }> };

/** One rating per user per draft; submitting again replaces it. */
export async function PUT(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;
  const { draftId } = await params;

  const loaded = await loadAuthorizedDraft(userId, draftId, "draft.feedback");
  if (!loaded.ok) return loaded.response;
  const { draft } = loaded;

  const body = await parseJsonBody(request, feedbackRequestSchema);
  if (!body.ok) return body.response;
  const rating = body.data.rating === "up" ? "UP" : "DOWN";
  const reasons = [...new Set(body.data.reasons)];

  try {
    const saved = await db.draftFeedback.upsert({
      where: { draftId_userId: { draftId: draft.id, userId } },
      create: {
        workspaceId: draft.workspaceId,
        draftId: draft.id,
        userId,
        rating,
        reasons,
        note: body.data.note,
      },
      update: { rating, reasons, note: body.data.note },
    });
    await recordAudit({
      action: "draft.feedback",
      workspaceId: draft.workspaceId,
      actorUserId: userId,
      targetType: "draft",
      targetId: draft.id,
      metadata: { rating: body.data.rating, reasons: reasons.join(",") },
    });
    return NextResponse.json<{ feedback: FeedbackDto }>({
      feedback: {
        rating: saved.rating === "UP" ? "up" : "down",
        reasons: saved.reasons as FeedbackReason[],
        note: saved.note,
      },
    });
  } catch (error) {
    return serverError({ route: "PUT /api/drafts/[draftId]/feedback", draftId }, error);
  }
}
