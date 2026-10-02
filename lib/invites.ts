import { fail, type ServiceFailure } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { generateSecret, hashSecret } from "@/lib/extension-auth";
import type { Role } from "@/lib/generated/prisma/enums";
import { canInviteRole } from "@/lib/members";
import { hashPassword } from "@/lib/passwords";
import { scopedWhere } from "@/lib/tenant";
import type { WorkspaceActor } from "@/lib/workspace-access";

/**
 * Invitations are the only way into a workspace during the pilot. A link is
 * single-use, expires after seven days, is bound to one email address, and is
 * stored only as a hash — the creator sees it once.
 */

export const INVITE_TTL_DAYS = 7;
const TOKEN_PREFIX = "rl_inv_";

export async function createInvite(
  actor: WorkspaceActor,
  input: { email: string; role: Role },
  now = new Date()
): Promise<{ ok: true; token: string; inviteId: string } | ServiceFailure> {
  if (!canInviteRole(actor.role, input.role)) {
    return fail(403, "forbidden", "Only owners can invite admins.", "role");
  }
  const alreadyMember = await db.membership.findFirst({
    where: { workspaceId: actor.workspaceId, user: { email: input.email } },
    select: { id: true },
  });
  if (alreadyMember) {
    return fail(409, "already_member", `${input.email} is already a member of this workspace.`, "email");
  }

  const token = generateSecret(TOKEN_PREFIX);
  const invite = await db.$transaction(async (tx) => {
    // A new invite replaces any pending one for the same address.
    await tx.invite.updateMany({
      where: { workspaceId: actor.workspaceId, email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const created = await tx.invite.create({
      data: {
        workspaceId: actor.workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashSecret(token),
        invitedById: actor.userId,
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000),
      },
      select: { id: true },
    });
    await recordAudit(
      {
        action: "member.invited",
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        targetType: "invite",
        targetId: created.id,
        metadata: { role: input.role },
      },
      tx
    );
    return created;
  });

  return { ok: true, token, inviteId: invite.id };
}

export async function revokeInvite(
  actor: WorkspaceActor,
  inviteId: string,
  now = new Date()
): Promise<{ ok: true } | ServiceFailure> {
  const invite = await db.invite.findFirst({ where: scopedWhere(actor, { id: inviteId }) });
  if (!invite) return fail(404, "not_found", "Invite not found.");
  if (invite.acceptedAt || invite.revokedAt) return fail(409, "not_pending", "This invite is no longer pending.");
  if (!canInviteRole(actor.role, invite.role)) {
    return fail(403, "forbidden", "Only owners can revoke admin invites.");
  }
  await db.invite.update({ where: { id: invite.id }, data: { revokedAt: now } });
  await recordAudit({
    action: "member.invite_revoked",
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    targetType: "invite",
    targetId: invite.id,
  });
  return { ok: true };
}

export type InviteView = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
  inviterName: string | null;
  expiresAt: Date;
};

export type InviteLookup =
  | { status: "valid"; invite: InviteView; accountExists: boolean }
  | { status: "invalid" | "expired" | "revoked" | "accepted" };

export async function findInviteByToken(token: string, now = new Date()): Promise<InviteLookup> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return { status: "invalid" };
  const invite = await db.invite.findUnique({
    where: { tokenHash: hashSecret(token) },
    include: {
      workspace: { select: { name: true } },
      invitedBy: { select: { name: true } },
    },
  });
  if (!invite) return { status: "invalid" };
  if (invite.acceptedAt) return { status: "accepted" };
  if (invite.revokedAt) return { status: "revoked" };
  if (invite.expiresAt <= now) return { status: "expired" };

  const account = await db.user.findUnique({ where: { email: invite.email }, select: { id: true } });
  return {
    status: "valid",
    accountExists: account !== null,
    invite: {
      id: invite.id,
      workspaceId: invite.workspaceId,
      workspaceName: invite.workspace.name,
      email: invite.email,
      role: invite.role,
      inviterName: invite.invitedBy?.name ?? null,
      expiresAt: invite.expiresAt,
    },
  };
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Marks the invite used, exactly once. */
async function claimInvite(tx: Tx, inviteId: string, now: Date): Promise<boolean> {
  const claimed = await tx.invite.updateMany({
    where: { id: inviteId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { acceptedAt: now },
  });
  return claimed.count === 1;
}

const UNAVAILABLE = "This invite link is no longer valid. Ask for a new one.";

/** A signed-in user accepts. The invite's email must be theirs. */
export async function acceptInviteAsUser(
  token: string,
  user: { id: string; email: string },
  now = new Date()
): Promise<{ ok: true; workspaceId: string } | ServiceFailure> {
  const lookup = await findInviteByToken(token, now);
  if (lookup.status !== "valid") return fail(410, "invite_unavailable", UNAVAILABLE);
  const { invite } = lookup;
  if (invite.email !== user.email.toLowerCase()) {
    return fail(403, "email_mismatch", `This invite is for ${invite.email}. Sign in with that account to accept it.`);
  }

  return db.$transaction(async (tx) => {
    if (!(await claimInvite(tx, invite.id, now))) return fail(410, "invite_unavailable", UNAVAILABLE);
    const existing = await tx.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
      select: { id: true },
    });
    // Someone who is already a member keeps their current role.
    if (!existing) {
      await tx.membership.create({ data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role } });
      await recordAudit(
        {
          action: "member.joined",
          workspaceId: invite.workspaceId,
          actorUserId: user.id,
          targetType: "invite",
          targetId: invite.id,
          metadata: { role: invite.role },
        },
        tx
      );
    }
    return { ok: true as const, workspaceId: invite.workspaceId };
  });
}

/** Someone without an account creates one from the invite. */
export async function registerFromInvite(
  token: string,
  input: { name: string; password: string },
  now = new Date()
): Promise<{ ok: true; workspaceId: string; email: string } | ServiceFailure> {
  const lookup = await findInviteByToken(token, now);
  if (lookup.status !== "valid") return fail(410, "invite_unavailable", UNAVAILABLE);
  if (lookup.accountExists) {
    return fail(409, "account_exists", "An account with this email already exists. Sign in to accept the invite.");
  }
  const { invite } = lookup;
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.$transaction(async (tx) => {
      if (!(await claimInvite(tx, invite.id, now))) return fail(410, "invite_unavailable", UNAVAILABLE);
      const user = await tx.user.create({
        data: { email: invite.email, name: input.name, passwordHash },
        select: { id: true },
      });
      await tx.membership.create({ data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role } });
      await recordAudit(
        {
          action: "member.joined",
          workspaceId: invite.workspaceId,
          actorUserId: user.id,
          targetType: "invite",
          targetId: invite.id,
          metadata: { role: invite.role, newAccount: true },
        },
        tx
      );
      return { ok: true as const, workspaceId: invite.workspaceId, email: invite.email };
    });
  } catch (error) {
    // Unique email violation: the account was created concurrently.
    if ((error as { code?: string }).code === "P2002") {
      return fail(409, "account_exists", "An account with this email already exists. Sign in to accept the invite.");
    }
    throw error;
  }
}
