import { createHash, randomBytes, randomInt } from "node:crypto";
import type { PollPairingResponse } from "@shared/contracts";
import { db } from "@/lib/db";

/**
 * Browser-extension sign-in, device-authorization style (RFC 8628 pattern):
 *
 *  1. The extension starts a pairing and gets a secret device code plus a short
 *     user code to show.
 *  2. The signed-in user types the user code on /extension/connect and approves.
 *  3. The extension polls with its device code and receives a bearer token once.
 *
 * Only SHA-256 hashes of device codes and tokens are stored. Tokens are
 * revocable and expire; every request still goes through membership checks.
 */

// RFC 8628 §6.1: consonants only, so codes don't spell words and aren't confused.
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const USER_CODE_LENGTH = 8;

export const PAIRING_TTL_SECONDS = 600;
export const PAIRING_POLL_INTERVAL_SECONDS = 3;
export const EXTENSION_SESSION_TTL_DAYS = 30;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function generateUserCode(): string {
  let code = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return code;
}

/** "BCDFGHJK" → "BCDF-GHJK" */
export function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts what a person might type ("bcdf ghjk", "BCDF-GHJK"); null if invalid. */
export function normalizeUserCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "");
  if (cleaned.length !== USER_CODE_LENGTH) return null;
  for (const char of cleaned) {
    if (!USER_CODE_ALPHABET.includes(char)) return null;
  }
  return cleaned;
}

export async function startPairing(clientLabel: string, now = new Date()) {
  const deviceCode = generateSecret("rl_dev_");
  let userCode = generateUserCode();
  // A clash with another live pending code is astronomically unlikely; retry anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.extensionPairing.findFirst({
      where: { userCode, status: "PENDING", expiresAt: { gt: now } },
      select: { id: true },
    });
    if (!clash) break;
    userCode = generateUserCode();
  }

  await db.extensionPairing.create({
    data: {
      deviceCodeHash: hashSecret(deviceCode),
      userCode,
      clientLabel,
      expiresAt: new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000),
    },
  });

  return {
    deviceCode,
    userCode: formatUserCode(userCode),
    expiresIn: PAIRING_TTL_SECONDS,
    interval: PAIRING_POLL_INTERVAL_SECONDS,
  };
}

export type DecidePairingResult =
  | { ok: true; status: "APPROVED" | "DENIED"; clientLabel: string; pairingId: string }
  | { ok: false; reason: "invalid_code" | "not_found" };

/** Called by the signed-in dashboard user who typed the code. */
export async function decidePairing(
  userId: string,
  rawUserCode: string,
  approve: boolean,
  now = new Date()
): Promise<DecidePairingResult> {
  const userCode = normalizeUserCode(rawUserCode);
  if (!userCode) return { ok: false, reason: "invalid_code" };

  const pairing = await db.extensionPairing.findFirst({
    where: { userCode, status: "PENDING", expiresAt: { gt: now } },
    select: { id: true, clientLabel: true },
  });
  if (!pairing) return { ok: false, reason: "not_found" };

  const status = approve ? "APPROVED" : "DENIED";
  // Conditional update: a pairing can only be decided once.
  const updated = await db.extensionPairing.updateMany({
    where: { id: pairing.id, status: "PENDING" },
    data: { status, userId, decidedAt: now },
  });
  if (updated.count !== 1) return { ok: false, reason: "not_found" };

  return { ok: true, status, clientLabel: pairing.clientLabel, pairingId: pairing.id };
}

/** Called by the extension. Hands out the bearer token exactly once. */
export async function pollPairing(deviceCode: string, now = new Date()): Promise<PollPairingResponse> {
  const pairing = await db.extensionPairing.findUnique({
    where: { deviceCodeHash: hashSecret(deviceCode) },
  });
  if (!pairing) return { status: "expired" };

  if (pairing.status === "DENIED") return { status: "denied" };
  if (pairing.status === "CONSUMED" || pairing.status === "EXPIRED") return { status: "expired" };

  if (pairing.expiresAt <= now) {
    await db.extensionPairing.updateMany({
      where: { id: pairing.id, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "EXPIRED" },
    });
    return { status: "expired" };
  }

  if (pairing.status === "PENDING" || !pairing.userId) return { status: "pending" };

  const userId = pairing.userId;
  const token = generateSecret("rl_ext_");
  const expiresAt = new Date(now.getTime() + EXTENSION_SESSION_TTL_DAYS * 86_400_000);

  const issued = await db.$transaction(async (tx) => {
    const consumed = await tx.extensionPairing.updateMany({
      where: { id: pairing.id, status: "APPROVED" },
      data: { status: "CONSUMED" },
    });
    if (consumed.count !== 1) return false;
    await tx.extensionSession.create({
      data: { userId, tokenHash: hashSecret(token), label: pairing.clientLabel, expiresAt },
    });
    return true;
  });

  return issued
    ? { status: "approved", token, expiresAt: expiresAt.toISOString() }
    : { status: "expired" };
}

export async function authenticateExtensionToken(
  token: string,
  now = new Date()
): Promise<{ sessionId: string; userId: string } | null> {
  if (!token.startsWith("rl_ext_") || token.length > 200) return null;

  const session = await db.extensionSession.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { disabledAt: true } },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= now || session.user.disabledAt) {
    return null;
  }

  if (now.getTime() - session.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
    await db.extensionSession.update({ where: { id: session.id }, data: { lastUsedAt: now } });
  }
  return { sessionId: session.id, userId: session.userId };
}

export async function revokeExtensionSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await db.extensionSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}
