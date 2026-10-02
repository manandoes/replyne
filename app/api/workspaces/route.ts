import { NextResponse, type NextRequest } from "next/server";
import { workspaceNameSchema } from "@shared/contracts";
import { parseJsonBody, rateLimited, serverError } from "@/lib/api";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/request-auth";
import { createWorkspace } from "@/lib/workspaces";

/** Any signed-in user can create a workspace; they become its owner. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth.response;

  const limit = await consumeRateLimit(`workspace:create:${auth.user.id}`, LIMITS.workspaceCreatePerUser);
  if (!limit.ok) return rateLimited(limit.retryAfterSeconds, "You've created several workspaces today. Try again tomorrow.");

  const body = await parseJsonBody(request, workspaceNameSchema);
  if (!body.ok) return body.response;

  try {
    const workspace = await createWorkspace(auth.user.id, body.data.name);
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return serverError({ route: "POST /api/workspaces", userId: auth.user.id }, error);
  }
}
