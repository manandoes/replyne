import { NextResponse, type NextRequest } from "next/server";
import type { MeResponse } from "@shared/contracts";
import { serverError, unauthorized } from "@/lib/api";
import { buildMeResponse } from "@/lib/me";
import { authenticateRequest } from "@/lib/request-auth";

/** The signed-in user, their workspaces, and the brand profiles they can draft with. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const me = await buildMeResponse(auth.user.id);
    if (!me) return unauthorized();
    return NextResponse.json<MeResponse>(me, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError({ route: "GET /api/ext/me", userId: auth.user.id }, error);
  }
}
