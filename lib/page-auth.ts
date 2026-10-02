import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { WorkspaceActor } from "@/lib/workspace-access";

/**
 * Authorization for server-rendered pages (the API routes have their own).
 * Cached per request, so a layout and its page share one lookup.
 */

export const currentUser = cache(getSessionUser);

export async function requirePageUser(nextPath: string) {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

const membershipFor = cache(async (userId: string, workspaceId: string) =>
  db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  })
);

/** The signed-in user's membership in this workspace; 404 for non-members. */
export async function requireWorkspacePage(workspaceId: string, nextPath: string) {
  const user = await requirePageUser(nextPath);
  const membership = await membershipFor(user.id, workspaceId);
  if (!membership) notFound();
  const actor: WorkspaceActor = { userId: user.id, workspaceId, role: membership.role };
  return { user, actor, workspace: membership.workspace };
}
