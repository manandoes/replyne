import { db } from "@/lib/db";

/**
 * Fixed-window rate limits and quotas backed by Postgres, so limits hold across
 * server instances. One atomic upsert per check.
 */

export const LIMITS = {
  draftPerUserPerMinute: { limit: 10, windowSeconds: 60 },
  draftPerWorkspacePerDay: { limit: 300, windowSeconds: 86_400 },
  pairingStartPerIp: { limit: 10, windowSeconds: 600 },
  pairingPollPerIp: { limit: 120, windowSeconds: 60 },
  pairingDecidePerUser: { limit: 10, windowSeconds: 600 },
  loginPerIpAndEmail: { limit: 10, windowSeconds: 900 },
  loginPerEmail: { limit: 50, windowSeconds: 900 },
  workspaceCreatePerUser: { limit: 10, windowSeconds: 86_400 },
  invitesPerWorkspace: { limit: 50, windowSeconds: 86_400 },
  passwordChangePerUser: { limit: 10, windowSeconds: 900 },
  inviteAcceptPerIp: { limit: 20, windowSeconds: 900 },
  conversationCreatePerUser: { limit: 60, windowSeconds: 3600 },
  watchlistCreatePerWorkspace: { limit: 20, windowSeconds: 86_400 },
  opportunityCreatePerWorkspace: { limit: 100, windowSeconds: 86_400 },
} as const;

export type RateLimitResult = { ok: boolean; count: number; retryAfterSeconds: number };

export function windowStartFor(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

export async function consumeRateLimit(
  key: string,
  rule: { limit: number; windowSeconds: number },
  nowMs: number = Date.now()
): Promise<RateLimitResult> {
  const windowStart = windowStartFor(nowMs, rule.windowSeconds);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitCounter" ("key", "windowStart", "count")
    VALUES (${key}, ${new Date(windowStart)}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  const retryAfterSeconds = Math.ceil((windowStart + rule.windowSeconds * 1000 - nowMs) / 1000);
  return { ok: count <= rule.limit, count, retryAfterSeconds };
}

/** Removes counters for windows that ended long ago. */
export async function pruneRateLimitCounters(olderThan: Date): Promise<number> {
  const result = await db.rateLimitCounter.deleteMany({ where: { windowStart: { lt: olderThan } } });
  return result.count;
}
