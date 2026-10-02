import { NextResponse, type NextRequest } from "next/server";
import { pollPairingRequestSchema, type PollPairingResponse } from "@shared/contracts";
import { clientIp, parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { pollPairing } from "@/lib/extension-auth";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";

/** Extension → poll a pairing. Returns the bearer token exactly once. */
export async function POST(request: NextRequest) {
  const limit = await consumeRateLimit(`pair:poll:${clientIp(request)}`, LIMITS.pairingPollPerIp);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds);

  const body = await parseJsonBody(request, pollPairingRequestSchema);
  if (!body.ok) return body.response;

  try {
    const result = await pollPairing(body.data.deviceCode);
    return NextResponse.json<PollPairingResponse>(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return serverError({ route: "POST /api/ext/pair/poll" }, error);
  }
}
