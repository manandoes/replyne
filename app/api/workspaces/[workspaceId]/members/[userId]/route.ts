import { NextResponse, type NextRequest } from "next/server";
import { updateMemberRequestSchema } from "@shared/contracts";
import { failureResponse, parseJsonBody, serverError } from "@/lib/api";
import { changeMemberRole, removeMember } from "@/lib/members";
import { authenticateRequest } from "@/lib/request-auth";
import { authorizeDashboard } from "@/lib/route-guards";
import { authorizeWorkspace } from "@/lib/workspace-access";

type Context = { params: Promise<{ workspaceId: string; userId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { workspaceId, userId } = await params;
  const access = await authorizeDashboard(request, workspaceId, "members.manage");
  if (!access.ok) return access.response;

  const body = await parseJsonBody(request, updateMemberRequestSchema);
  if (!body.ok) return body.response;

  try {
    const result = await changeMemberRole(access.actor, userId, body.data.role);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError({ route: "PATCH /api/workspaces/[workspaceId]/members/[userId]", workspaceId }, error);
  }
}

/** Remove a member, or leave the workspace when removing yourself. */
export async function DELETE(request: NextRequest, { params }: Context) {
  const { workspaceId, userId } = await params;
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth.response;

  const leaving = userId === auth.user.id;
  const access = await authorizeWorkspace(auth.user.id, workspaceId, leaving ? "workspace.read" : "members.manage");
  if (!access.ok) return access.response;

  try {
    const result = await removeMember(access.actor, userId);
    if (!result.ok) return failureResponse(result);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError({ route: "DELETE /api/workspaces/[workspaceId]/members/[userId]", workspaceId }, error);
  }
}
