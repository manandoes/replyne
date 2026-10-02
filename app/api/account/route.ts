import { NextResponse, type NextRequest } from "next/server";
import { accountNameSchema } from "@shared/contracts";
import { parseJsonBody, serverError } from "@/lib/api";
import { updateAccountName } from "@/lib/account";
import { authenticateRequest } from "@/lib/request-auth";

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, { allow: "session" });
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(request, accountNameSchema);
  if (!body.ok) return body.response;

  try {
    await updateAccountName(auth.user.id, body.data.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError({ route: "PATCH /api/account", userId: auth.user.id }, error);
  }
}
