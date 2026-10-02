import { NextResponse, type NextRequest } from "next/server";
import { failureResponse, notFound, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { revokeInvite } from "@/lib/invites";
import { authorizeDashboard } from "@/lib/route-guards";

type Context = { params: Promise<{ inviteId: string }> };

export async function DELETE(request: NextRequest, { params }: Context) {
  const { inviteId } = await params;
  const invite = await db.invite.findUnique({ where: { id: inviteId }, select: { workspaceId: true } });
  if (!invite) return notFound("Invite not found.");

  const access = await authorizeDashboard(request, invite.workspaceId, "members.manage");
  if (!access.ok) return access.response;

  try {
    const result = await revokeInvite(access.actor, inviteId);
    if (!result.ok) return failureResponse(result);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError({ route: "DELETE /api/invites/[inviteId]", inviteId }, error);
  }
}
