import { NextResponse, type NextRequest } from "next/server";
import { notFound, serverError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { revokeExtensionSession } from "@/lib/extension-auth";
import { authenticateRequest } from "@/lib/request-auth";

type Context = { params: Promise<{ sessionId: string }> };

/** Signs out one connected extension. Only the account's own sessions are visible. */
export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth.response;
  const { sessionId } = await params;

  try {
    const revoked = await revokeExtensionSession(sessionId, auth.user.id);
    if (!revoked) return notFound("Session not found.");
    await recordAudit({
      action: "extension.session_revoked",
      actorUserId: auth.user.id,
      targetType: "extension_session",
      targetId: sessionId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError({ route: "DELETE /api/account/extension-sessions/[sessionId]", sessionId }, error);
  }
}
