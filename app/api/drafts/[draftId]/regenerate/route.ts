import { NextResponse, type NextRequest } from "next/server";
import { regenerateDraftRequestSchema, type DraftOptions, type DraftResponse } from "@shared/contracts";
import { apiError, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { aiErrorResponse, AiProviderError } from "@/lib/ai/errors";
import { loadAuthorizedDraft } from "@/lib/drafts/access";
import { capturedTextAvailable } from "@/lib/drafts/data";
import { generateDraft } from "@/lib/drafts/service";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/request-auth";

type Context = { params: Promise<{ draftId: string }> };

/** New draft for the same conversation; the previous one stays in history. */
export async function POST(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;
  const { draftId } = await params;

  const loaded = await loadAuthorizedDraft(userId, draftId, "draft.generate");
  if (!loaded.ok) return loaded.response;
  const { draft } = loaded;

  const body = await parseJsonBody(request, regenerateDraftRequestSchema);
  if (!body.ok) return body.response;

  // Past its retention window the text is unusable even if the hourly purge hasn't run yet.
  if (draft.capturedText === null || !capturedTextAvailable(draft)) {
    return apiError(
      "The original text was removed under the retention policy. Capture it again to redraft.",
      409,
      "captured_text_expired"
    );
  }
  if (draft.brandProfile.archivedAt) {
    return apiError("This brand profile was archived.", 409, "profile_archived");
  }

  const [perUser, perWorkspace] = await Promise.all([
    consumeRateLimit(`draft:user:${userId}`, LIMITS.draftPerUserPerMinute),
    consumeRateLimit(`draft:ws:${draft.workspaceId}`, LIMITS.draftPerWorkspacePerDay),
  ]);
  if (!perUser.ok) return rateLimited(perUser.retryAfterSeconds, "You're drafting quickly — wait a moment.");
  if (!perWorkspace.ok) {
    return rateLimited(perWorkspace.retryAfterSeconds, "This workspace reached today's drafting limit.");
  }

  const previous = draft.options as DraftOptions;
  try {
    const next = await generateDraft({
      userId,
      profile: draft.brandProfile,
      capturedText: draft.capturedText,
      sourceUrl: draft.sourceUrl,
      options: body.data.options ?? {
        tone: previous.tone,
        length: previous.length,
        brandMention: previous.brandMention,
      },
      channel: draft.channel === "DASHBOARD" ? "dashboard" : "extension",
      instruction: body.data.instruction || undefined,
      regeneratedFromId: draft.id,
    });
    return NextResponse.json<DraftResponse>({ draft: next }, { status: 201 });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return aiErrorResponse(error, { route: "POST /api/drafts/[draftId]/regenerate", draftId });
    }
    return serverError({ route: "POST /api/drafts/[draftId]/regenerate", draftId }, error);
  }
}
