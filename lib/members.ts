import { fail, type ServiceFailure } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Role } from "@/lib/generated/prisma/enums";
import type { WorkspaceActor } from "@/lib/workspace-access";

/**
 * Membership rules:
 *  - Owners manage everyone. Admins manage members and viewers only, and can't
 *    grant admin or owner.
 *  - Anyone may leave. A workspace always keeps at least one owner.
 * Owner rows are locked (FOR UPDATE) while a change is checked, so two owners
 * demoting each other at the same moment can't leave a workspace ownerless.
 */

const isBasic = (role: Role) => role === "MEMBER" || role === "VIEWER";

export function canChangeRole(actorRole: Role, currentRole: Role, nextRole: Role): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return isBasic(currentRole) && isBasic(nextRole);
  return false;
}

export function canRemoveMember(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return isBasic(targetRole);
  return false;
}

export function canInviteRole(actorRole: Role, role: Role): boolean {
  if (actorRole === "OWNER") return role !== "OWNER";
  if (actorRole === "ADMIN") return isBasic(role);
  return false;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function lockOwners(tx: Tx, workspaceId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ userId: string }[]>`
    SELECT "userId" FROM "Membership"
    WHERE "workspaceId" = ${workspaceId} AND "role" = 'OWNER'
    FOR UPDATE`;
  return rows.map((row) => row.userId);
}

const LAST_OWNER = "A workspace needs at least one owner. Make someone else an owner first.";

export async function changeMemberRole(
  actor: WorkspaceActor,
  targetUserId: string,
  nextRole: Role
): Promise<{ ok: true; changed: boolean } | ServiceFailure> {
  return db.$transaction(async (tx) => {
    const owners = await lockOwners(tx, actor.workspaceId);
    const target = await tx.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: targetUserId } },
    });
    if (!target) return fail(404, "not_found", "Member not found.");
    if (target.role === nextRole) return { ok: true as const, changed: false };
    if (!canChangeRole(actor.role, target.role, nextRole)) {
      return fail(403, "forbidden", "Only owners can change admin and owner roles.");
    }
    if (target.role === "OWNER" && owners.length <= 1) return fail(409, "last_owner", LAST_OWNER);

    await tx.membership.update({ where: { id: target.id }, data: { role: nextRole } });
    await recordAudit(
      {
        action: "member.role_changed",
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        targetType: "user",
        targetId: targetUserId,
        metadata: { from: target.role, to: nextRole },
      },
      tx
    );
    return { ok: true as const, changed: true };
  });
}

/** Removes someone else, or — when `targetUserId` is the actor — leaves the workspace. */
export async function removeMember(
  actor: WorkspaceActor,
  targetUserId: string
): Promise<{ ok: true; left: boolean } | ServiceFailure> {
  const self = targetUserId === actor.userId;
  return db.$transaction(async (tx) => {
    const owners = await lockOwners(tx, actor.workspaceId);
    const target = await tx.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: targetUserId } },
    });
    if (!target) return fail(404, "not_found", "Member not found.");
    if (!self && !canRemoveMember(actor.role, target.role)) {
      return fail(403, "forbidden", "Only owners can remove admins and owners.");
    }
    if (target.role === "OWNER" && owners.length <= 1) {
      return fail(
        409,
        "last_owner",
        self ? "You're the only owner. Make someone else an owner, or delete the workspace." : LAST_OWNER
      );
    }

    await tx.membership.delete({ where: { id: target.id } });
    await recordAudit(
      {
        action: self ? "member.left" : "member.removed",
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        targetType: "user",
        targetId: targetUserId,
        metadata: { role: target.role },
      },
      tx
    );
    return { ok: true as const, left: self };
  });
}
