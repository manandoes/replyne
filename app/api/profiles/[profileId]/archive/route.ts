import { NextResponse, type NextRequest } from "next/server";
import { archiveProfileRequestSchema } from "@shared/contracts";
import { failureResponse, notFound, parseJsonBody, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { setProfileArchived } from "@/lib/profiles";
import { authorizeDashboard } from "@/lib/route-guards";

type Context = { params: Promise<{ profileId: string }> };

/** Archive (hide from drafting) or restore a brand profile. */
export async function POST(request: NextRequest, { params }: Context) {
  const { profileId } = await params;
  const profile = await db.brandProfile.findUnique({ where: { id: profileId }, select: { workspaceId: true } });
  if (!profile) return notFound("Brand profile not found.");

  const access = await authorizeDashboard(request, profile.workspaceId, "profile.manage");
  if (!access.ok) return access.response;

  const body = await parseJsonBody(request, archiveProfileRequestSchema);
  if (!body.ok) return body.response;

  try {
    const result = await setProfileArchived(access.actor, profileId, body.data.archived);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError({ route: "POST /api/profiles/[profileId]/archive", profileId }, error);
  }
}
