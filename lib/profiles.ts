import type { z } from "zod";
import type { brandProfileInputSchema } from "@shared/contracts";
import { fail, type ServiceFailure } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { WorkspaceActor } from "@/lib/workspace-access";

/**
 * Brand profiles are archived rather than deleted, so draft history keeps the
 * profile it was written with. Archived profiles disappear from the extension.
 */

export const MAX_ACTIVE_PROFILES = 25;

export type ProfileInput = z.output<typeof brandProfileInputSchema>;

const tooMany = () =>
  fail(409, "profile_limit", `A workspace can have up to ${MAX_ACTIVE_PROFILES} active brand profiles.`);

function auditMetadata(input: ProfileInput) {
  return {
    facts: input.facts.length,
    prohibitedClaims: input.prohibitedClaims.length,
    linkPolicy: input.linkPolicy,
  };
}

export async function createProfile(
  actor: WorkspaceActor,
  input: ProfileInput
): Promise<{ ok: true; profileId: string } | ServiceFailure> {
  const active = await db.brandProfile.count({ where: scopedWhere(actor, { archivedAt: null }) });
  if (active >= MAX_ACTIVE_PROFILES) return tooMany();

  const profile = await db.brandProfile.create({
    data: { ...input, workspaceId: actor.workspaceId },
    select: { id: true },
  });
  await recordAudit({
    action: "profile.created",
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    targetType: "brand_profile",
    targetId: profile.id,
    metadata: auditMetadata(input),
  });
  return { ok: true, profileId: profile.id };
}

export async function updateProfile(
  actor: WorkspaceActor,
  profileId: string,
  input: ProfileInput
): Promise<{ ok: true } | ServiceFailure> {
  const updated = await db.brandProfile.updateMany({
    where: scopedWhere(actor, { id: profileId }),
    data: input,
  });
  if (updated.count !== 1) return fail(404, "not_found", "Brand profile not found.");
  await recordAudit({
    action: "profile.updated",
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    targetType: "brand_profile",
    targetId: profileId,
    metadata: auditMetadata(input),
  });
  return { ok: true };
}

export async function setProfileArchived(
  actor: WorkspaceActor,
  profileId: string,
  archived: boolean
): Promise<{ ok: true } | ServiceFailure> {
  const profile = await db.brandProfile.findFirst({
    where: scopedWhere(actor, { id: profileId }),
    select: { archivedAt: true },
  });
  if (!profile) return fail(404, "not_found", "Brand profile not found.");
  if ((profile.archivedAt !== null) === archived) return { ok: true };

  if (!archived) {
    const active = await db.brandProfile.count({ where: scopedWhere(actor, { archivedAt: null }) });
    if (active >= MAX_ACTIVE_PROFILES) return tooMany();
  }
  await db.brandProfile.update({ where: { id: profileId }, data: { archivedAt: archived ? new Date() : null } });
  await recordAudit({
    action: archived ? "profile.archived" : "profile.restored",
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    targetType: "brand_profile",
    targetId: profileId,
  });
  return { ok: true };
}
