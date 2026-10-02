import type { NextResponse } from "next/server";
import type { Permission } from "@/lib/permissions";
import { authenticateRequest } from "@/lib/request-auth";
import { authorizeWorkspace, type WorkspaceActor } from "@/lib/workspace-access";

/**
 * Dashboard-only routes: a same-origin session is required (extension tokens
 * are refused) and the caller must hold `permission` in the workspace.
 */
export async function authorizeDashboard(
  request: Request,
  workspaceId: string,
  permission: Permission
): Promise<{ ok: true; actor: WorkspaceActor } | { ok: false; response: NextResponse }> {
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth;
  return authorizeWorkspace(auth.user.id, workspaceId, permission);
}
