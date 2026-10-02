import { NextResponse, type NextRequest } from "next/server";
import { brandProfileInputSchema } from "@shared/contracts";
import { failureResponse, notFound, parseJsonBody, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { updateProfile } from "@/lib/profiles";
import { authorizeDashboard } from "@/lib/route-guards";

type Context = { params: Promise<{ profileId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { profileId } = await params;
  const profile = await db.brandProfile.findUnique({ where: { id: profileId }, select: { workspaceId: true } });
  if (!profile) return notFound("Brand profile not found.");

  const access = await authorizeDashboard(request, profile.workspaceId, "profile.manage");
  if (!access.ok) return access.response;

  const body = await parseJsonBody(request, brandProfileInputSchema);
  if (!body.ok) return body.response;

  try {
    const result = await updateProfile(access.actor, profileId, body.data);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError({ route: "PATCH /api/profiles/[profileId]", profileId }, error);
  }
}
