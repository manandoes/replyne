import { NextResponse, type NextRequest } from "next/server";
import { deleteWorkspaceSchema, workspaceNameSchema } from "@shared/contracts";
import { failureResponse, parseJsonBody, serverError } from "@/lib/api";
import { authorizeDashboard } from "@/lib/route-guards";
import { deleteWorkspace, renameWorkspace } from "@/lib/workspaces";

type Context = { params: Promise<{ workspaceId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { workspaceId } = await params;
  const access = await authorizeDashboard(request, workspaceId, "workspace.manage");
  if (!access.ok) return access.response;

  const body = await parseJsonBody(request, workspaceNameSchema);
  if (!body.ok) return body.response;

  try {
    await renameWorkspace(access.actor, body.data.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError({ route: "PATCH /api/workspaces/[workspaceId]", workspaceId }, error);
  }
}

/** Owners only, confirmed by typing the workspace name. Irreversible. */
export async function DELETE(request: NextRequest, { params }: Context) {
  const { workspaceId } = await params;
  const access = await authorizeDashboard(request, workspaceId, "workspace.delete");
  if (!access.ok) return access.response;

  const body = await parseJsonBody(request, deleteWorkspaceSchema);
  if (!body.ok) return body.response;

  try {
    const result = await deleteWorkspace(access.actor, body.data.confirmName);
    if (!result.ok) return failureResponse(result);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError({ route: "DELETE /api/workspaces/[workspaceId]", workspaceId }, error);
  }
}
