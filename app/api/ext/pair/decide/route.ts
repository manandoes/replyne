import { NextResponse, type NextRequest } from "next/server";
import { decidePairingRequestSchema } from "@shared/contracts";
import { apiError, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { decidePairing } from "@/lib/extension-auth";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/request-auth";

/**
 * Dashboard → approve or deny a pairing code. Requires the dashboard session:
 * an extension token must never be able to mint further extension tokens.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const limit = await consumeRateLimit(`pair:decide:${userId}`, LIMITS.pairingDecidePerUser);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds, "Too many attempts. Wait a few minutes.");

  const body = await parseJsonBody(request, decidePairingRequestSchema);
  if (!body.ok) return body.response;

  try {
    const result = await decidePairing(userId, body.data.userCode, body.data.decision === "approve");
    if (!result.ok) {
      return result.reason === "invalid_code"
        ? apiError("That doesn't look like a valid code (8 letters, like BCDF-GHJK).", 400, "invalid_code")
        : apiError("Code not found or expired. Start again from the extension.", 404, "code_not_found");
    }
    await recordAudit({
      action: result.status === "APPROVED" ? "extension.pairing_approved" : "extension.pairing_denied",
      actorUserId: userId,
      targetType: "extension_pairing",
      targetId: result.pairingId,
    });
    return NextResponse.json({ status: result.status, clientLabel: result.clientLabel });
  } catch (error) {
    return serverError({ route: "POST /api/ext/pair/decide", userId }, error);
  }
}
