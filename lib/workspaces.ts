import { fail, type ServiceFailure } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { WorkspaceActor } from "@/lib/workspace-access";

export async function createWorkspace(userId: string, name: string) {
  const workspace = await db.workspace.create({
    data: { name, memberships: { create: { userId, role: "OWNER" } } },
    select: { id: true, name: true },
  });
  await recordAudit({
    action: "workspace.created",
    workspaceId: workspace.id,
    actorUserId: userId,
    targetType: "workspace",
    targetId: workspace.id,
  });
  return workspace;
}

export async function renameWorkspace(actor: WorkspaceActor, name: string) {
  await db.workspace.update({ where: { id: actor.workspaceId }, data: { name } });
  await recordAudit({
    action: "workspace.renamed",
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    targetType: "workspace",
    targetId: actor.workspaceId,
  });
}

/**
 * Permanently deletes a workspace and everything in it (profiles, drafts,
 * captured text, feedback, invites, memberships, its audit log). A single
 * platform-level audit event — ids only — records that it happened.
 */
export async function deleteWorkspace(
  actor: WorkspaceActor,
  confirmName: string
): Promise<{ ok: true } | ServiceFailure> {
  const workspace = await db.workspace.findUnique({ where: { id: actor.workspaceId }, select: { name: true } });
  if (!workspace) return fail(404, "not_found", "Workspace not found.");
  if (confirmName.trim() !== workspace.name.trim()) {
    return fail(400, "confirm_mismatch", "Type the workspace name exactly to confirm.", "confirmName");
  }

  await db.$transaction(async (tx) => {
    await recordAudit(
      {
        action: "workspace.deleted",
        workspaceId: null,
        actorUserId: actor.userId,
        targetType: "workspace",
        targetId: actor.workspaceId,
      },
      tx
    );
    await tx.workspace.delete({ where: { id: actor.workspaceId } });
  });
  return { ok: true };
}
