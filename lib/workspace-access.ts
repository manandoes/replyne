import type { NextResponse } from "next/server";
import { forbidden, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import type { Role } from "@/lib/generated/prisma/enums";
import { can, type Permission } from "@/lib/permissions";

export type WorkspaceActor = { userId: string; workspaceId: string; role: Role };

export async function getWorkspaceActor(
  userId: string,
  workspaceId: string
): Promise<WorkspaceActor | null> {
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return membership ? { userId, workspaceId, role: membership.role } : null;
}

/**
 * Membership + permission check. A non-member gets 404 — the same answer as a
 * workspace that doesn't exist — so ids can't be probed across tenants.
 */
export async function authorizeWorkspace(
  userId: string,
  workspaceId: string,
  permission: Permission
): Promise<{ ok: true; actor: WorkspaceActor } | { ok: false; response: NextResponse }> {
  const actor = await getWorkspaceActor(userId, workspaceId);
  if (!actor) return { ok: false, response: notFound() };
  if (!can(actor.role, permission)) return { ok: false, response: forbidden() };
  return { ok: true, actor };
}
