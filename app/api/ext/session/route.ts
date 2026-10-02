import { NextResponse, type NextRequest } from "next/server";
import { serverError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { revokeExtensionSession } from "@/lib/extension-auth";
import { authenticateRequest } from "@/lib/request-auth";

/** Extension sign-out: revokes the calling extension's own token. */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, { allow: "extension" });
  if (!auth.ok) return auth.response;
  if (auth.user.via !== "extension") return new NextResponse(null, { status: 204 });

  try {
    const revoked = await revokeExtensionSession(auth.user.extensionSessionId, auth.user.id);
    if (revoked) {
      await recordAudit({
        action: "extension.session_revoked",
        actorUserId: auth.user.id,
        targetType: "extension_session",
        targetId: auth.user.extensionSessionId,
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError({ route: "DELETE /api/ext/session", userId: auth.user.id }, error);
  }
}
