import { NextResponse, type NextRequest } from "next/server";
import { changePasswordRequestSchema } from "@shared/contracts";
import { failureResponse, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { changePassword } from "@/lib/account";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/request-auth";

/** Changes the password and signs out every dashboard session, this one included. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth.response;

  const limit = await consumeRateLimit(`password:${auth.user.id}`, LIMITS.passwordChangePerUser);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds, "Too many attempts. Wait 15 minutes and try again.");

  const body = await parseJsonBody(request, changePasswordRequestSchema);
  if (!body.ok) return body.response;

  try {
    const result = await changePassword(auth.user.id, body.data.currentPassword, body.data.newPassword);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true, signedOut: true });
  } catch (error) {
    return serverError({ route: "POST /api/account/password", userId: auth.user.id }, error);
  }
}
