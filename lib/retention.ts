import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { pruneRateLimitCounters } from "@/lib/rate-limit";

/**
 * Data-retention sweep (run by POST /api/jobs/purge-expired):
 *  - removes Reddit text users captured once its retention window has passed
 *    (the draft itself — the team's own text — its source link, and feedback remain);
 *  - drops rate-limit counters from windows that ended more than two days ago.
 */
export async function purgeExpiredData(now = new Date()) {
  const purgedDrafts = await db.draft.updateMany({
    where: { capturedText: { not: null }, capturedTextExpiresAt: { lte: now } },
    data: { capturedText: null, capturedTextPurgedAt: now },
  });
  const purgedConversations = await db.conversation.updateMany({
    where: { text: { not: null }, textExpiresAt: { lte: now } },
    data: { text: null, textPurgedAt: now },
  });
  const prunedCounters = await pruneRateLimitCounters(new Date(now.getTime() - 2 * 86_400_000));

  const totalPurged = purgedDrafts.count + purgedConversations.count;
  if (totalPurged > 0) {
    await recordAudit({
      action: "retention.purged",
      metadata: { capturedTexts: purgedDrafts.count, conversationTexts: purgedConversations.count },
    });
  }
  return { capturedTextsPurged: purgedDrafts.count, conversationTextsPurged: purgedConversations.count, rateLimitCountersPruned: prunedCounters };
}
