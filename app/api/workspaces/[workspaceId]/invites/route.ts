import { NextResponse, type NextRequest } from "next/server";
import { inviteRequestSchema } from "@shared/contracts";
import { failureResponse, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { appUrl } from "@/lib/config";
import { createInvite, INVITE_TTL_DAYS } from "@/lib/invites";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { authorizeDashboard } from "@/lib/route-guards";

type Context = { params: Promise<{ workspaceId: string }> };

/** Creates an invite and returns its link — the only time the link is available. */
export async function POST(request: NextRequest, { params }: Context) {
  const { workspaceId } = await params;
  const access = await authorizeDashboard(request, workspaceId, "members.manage");
  if (!access.ok) return access.response;

  const limit = await consumeRateLimit(`invites:${workspaceId}`, LIMITS.invitesPerWorkspace);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds, "This workspace sent many invites today. Try again tomorrow.");

  const body = await parseJsonBody(request, inviteRequestSchema);
  if (!body.ok) return body.response;

  try {
    const result = await createInvite(access.actor, body.data);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json(
      {
        inviteId: result.inviteId,
        inviteUrl: `${appUrl()}/invite/${result.token}`,
        expiresInDays: INVITE_TTL_DAYS,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return serverError({ route: "POST /api/workspaces/[workspaceId]/invites", workspaceId }, error);
  }
}
