import { NextResponse, type NextRequest } from "next/server";
import { serverError } from "@/lib/api";
import { revokeAllExtensionSessions } from "@/lib/account";
import { authenticateRequest } from "@/lib/request-auth";

/** Signs out every browser extension connected to this account. */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth.response;
  try {
    const revoked = await revokeAllExtensionSessions(auth.user.id);
    return NextResponse.json({ revoked });
  } catch (error) {
    return serverError({ route: "DELETE /api/account/extension-sessions", userId: auth.user.id }, error);
  }
}
