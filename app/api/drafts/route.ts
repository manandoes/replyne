import { NextResponse, type NextRequest } from "next/server";
import { generateDraftRequestSchema, type DraftResponse } from "@shared/contracts";
import { notFound, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { aiErrorResponse, AiProviderError } from "@/lib/ai/errors";
import { db } from "@/lib/db";
import { generateDraft } from "@/lib/drafts/service";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/request-auth";
import { scopedWhere } from "@/lib/tenant";
import { authorizeWorkspace } from "@/lib/workspace-access";

/** Generate an AI-assisted draft from text the user captured or pasted. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await parseJsonBody(request, generateDraftRequestSchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const access = await authorizeWorkspace(userId, input.workspaceId, "draft.generate");
  if (!access.ok) return access.response;

  const profile = await db.brandProfile.findFirst({
    where: scopedWhere(access.actor, { id: input.brandProfileId, archivedAt: null }),
  });
  if (!profile) return notFound("Brand profile not found.");

  const [perUser, perWorkspace] = await Promise.all([
    consumeRateLimit(`draft:user:${userId}`, LIMITS.draftPerUserPerMinute),
    consumeRateLimit(`draft:ws:${profile.workspaceId}`, LIMITS.draftPerWorkspacePerDay),
  ]);
  if (!perUser.ok) return rateLimited(perUser.retryAfterSeconds, "You're drafting quickly — wait a moment.");
  if (!perWorkspace.ok) {
    return rateLimited(perWorkspace.retryAfterSeconds, "This workspace reached today's drafting limit.");
  }

  try {
    const draft = await generateDraft({
      userId,
      profile,
      capturedText: input.capturedText,
      sourceUrl: input.sourceUrl,
      options: input.options,
      channel: input.channel,
    });
    return NextResponse.json<DraftResponse>({ draft }, { status: 201 });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return aiErrorResponse(error, { route: "POST /api/drafts", workspaceId: profile.workspaceId });
    }
    return serverError({ route: "POST /api/drafts", userId }, error);
  }
}
