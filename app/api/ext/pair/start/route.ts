import { NextResponse, type NextRequest } from "next/server";
import { startPairingRequestSchema, type StartPairingResponse } from "@shared/contracts";
import { clientIp, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { appUrl } from "@/lib/config";
import { startPairing } from "@/lib/extension-auth";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";

/** Extension → start a pairing. Public, rate limited per IP. */
export async function POST(request: NextRequest) {
  const limit = await consumeRateLimit(`pair:start:${clientIp(request)}`, LIMITS.pairingStartPerIp);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds);

  const body = await parseJsonBody(request, startPairingRequestSchema);
  if (!body.ok) return body.response;

  try {
    const pairing = await startPairing(body.data.clientLabel);
    return NextResponse.json<StartPairingResponse>({
      ...pairing,
      verificationUri: `${appUrl()}/extension/connect`,
    });
  } catch (error) {
    return serverError({ route: "POST /api/ext/pair/start" }, error);
  }
}
