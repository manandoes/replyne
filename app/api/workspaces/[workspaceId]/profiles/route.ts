import { NextResponse, type NextRequest } from "next/server";
import { brandProfileInputSchema } from "@shared/contracts";
import { failureResponse, parseJsonBody, serverError } from "@/lib/api";
import { createProfile } from "@/lib/profiles";
import { authorizeDashboard } from "@/lib/route-guards";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { workspaceId } = await params;
  const access = await authorizeDashboard(request, workspaceId, "profile.manage");
  if (!access.ok) return access.response;

  const body = await parseJsonBody(request, brandProfileInputSchema);
  if (!body.ok) return body.response;

  try {
    const result = await createProfile(access.actor, body.data);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ profileId: result.profileId }, { status: 201 });
  } catch (error) {
    return serverError({ route: "POST /api/workspaces/[workspaceId]/profiles", workspaceId }, error);
  }
}
