import type { NextResponse } from "next/server";
import { notFound } from "@/lib/api";
import { db } from "@/lib/db";
import type { Permission } from "@/lib/permissions";
import { authorizeWorkspace, type WorkspaceActor } from "@/lib/workspace-access";

/**
 * Loads a draft by id and authorizes the caller in the draft's own workspace.
 * A draft in a workspace the caller doesn't belong to is reported as 404,
 * exactly like a draft that doesn't exist.
 */
export async function loadAuthorizedDraft(userId: string, draftId: string, permission: Permission) {
  const draft = await db.draft.findUnique({
    where: { id: draftId },
    include: { brandProfile: true },
  });
  if (!draft) return { ok: false as const, response: notFound("Draft not found.") as NextResponse };

  const access = await authorizeWorkspace(userId, draft.workspaceId, permission);
  if (!access.ok) {
    // Non-members get the same 404 as a missing draft; members lacking the permission get 403.
    return { ok: false as const, response: access.response };
  }
  return { ok: true as const, draft, actor: access.actor satisfies WorkspaceActor };
}
