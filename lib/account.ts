import { fail, type ServiceFailure } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export async function updateAccountName(userId: string, name: string) {
  await db.user.update({ where: { id: userId }, data: { name } });
  await recordAudit({ action: "account.updated", actorUserId: userId, targetType: "user", targetId: userId });
}

/**
 * Changes the password and bumps sessionVersion, which signs out every
 * dashboard session (including the current one). Extension sessions are
 * listed separately and can be revoked on the account page.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | ServiceFailure> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return fail(400, "wrong_password", "Your current password is incorrect.", "currentPassword");
  }
  if (currentPassword === newPassword) {
    return fail(400, "same_password", "Choose a password you haven't used here.", "newPassword");
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
  });
  await recordAudit({ action: "account.password_changed", actorUserId: userId, targetType: "user", targetId: userId });
  return { ok: true };
}

export async function listExtensionSessions(userId: string, now = new Date()) {
  return db.extensionSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  });
}

export async function revokeAllExtensionSessions(userId: string): Promise<number> {
  const result = await db.extensionSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count > 0) {
    await recordAudit({
      action: "extension.session_revoked",
      actorUserId: userId,
      targetType: "user",
      targetId: userId,
      metadata: { sessions: result.count },
    });
  }
  return result.count;
}
