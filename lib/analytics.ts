import { db } from "@/lib/db";

/**
 * Workspace product analytics — what Replyline itself observes: drafts
 * generated, edited, copied, and rated. Whether a reply was posted on Reddit is
 * never known and never estimated. Days are UTC.
 */

export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export function parsePeriod(value: string | string[] | undefined): AnalyticsPeriod {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return (ANALYTICS_PERIODS as readonly number[]).includes(days) ? (days as AnalyticsPeriod) : 30;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

type Totals = {
  generated: number;
  copied: number;
  edited: number;
  extension: number;
  ratedUp: number;
  ratedDown: number;
  activeMembers: number;
};

async function totalsBetween(workspaceId: string, from: Date, to: Date): Promise<Totals> {
  const range = { gte: from, lt: to };
  const [generated, copied, edited, extension, ratings, active] = await Promise.all([
    db.draft.count({ where: { workspaceId, createdAt: range } }),
    db.draft.count({ where: { workspaceId, createdAt: range, copyCount: { gt: 0 } } }),
    db.draft.count({ where: { workspaceId, createdAt: range, editedAt: { not: null } } }),
    db.draft.count({ where: { workspaceId, createdAt: range, channel: "EXTENSION" } }),
    db.draftFeedback.groupBy({
      by: ["rating"],
      where: { workspaceId, updatedAt: range },
      _count: { _all: true },
    }),
    db.$queryRaw<{ count: number }[]>`
      SELECT count(DISTINCT user_id)::int AS count FROM (
        SELECT "createdById" AS user_id FROM "Draft"
          WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
            AND "createdById" IS NOT NULL
        UNION
        SELECT "userId" FROM "DraftFeedback"
          WHERE "workspaceId" = ${workspaceId} AND "updatedAt" >= ${from} AND "updatedAt" < ${to}
      ) AS active`,
  ]);
  const rated = (rating: "UP" | "DOWN") => ratings.find((row) => row.rating === rating)?._count._all ?? 0;
  return {
    generated,
    copied,
    edited,
    extension,
    ratedUp: rated("UP"),
    ratedDown: rated("DOWN"),
    activeMembers: Number(active[0]?.count ?? 0),
  };
}

export async function workspaceAnalytics(workspaceId: string, days: AnalyticsPeriod, now = new Date()) {
  // Whole UTC days: the current day plus the (days - 1) before it.
  const to = new Date(startOfUtcDay(now).getTime() + DAY_MS);
  const from = new Date(to.getTime() - days * DAY_MS);
  const previousFrom = new Date(from.getTime() - days * DAY_MS);

  const [current, previous, dailyRows, profileRows, reasonRows] = await Promise.all([
    totalsBetween(workspaceId, from, to),
    totalsBetween(workspaceId, previousFrom, from),
    db.$queryRaw<{ day: Date; generated: number; copied: number }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day,
             count(*)::int AS generated,
             count(*) FILTER (WHERE "copyCount" > 0)::int AS copied
      FROM "Draft"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ id: string; name: string; archived: boolean; generated: number; copied: number; up: number; down: number }[]>`
      SELECT p.id, p.name, p."archivedAt" IS NOT NULL AS archived,
             count(d.id)::int AS generated,
             count(d.id) FILTER (WHERE d."copyCount" > 0)::int AS copied,
             coalesce(sum(fb.up), 0)::int AS up,
             coalesce(sum(fb.down), 0)::int AS down
      FROM "BrandProfile" p
      JOIN "Draft" d ON d."brandProfileId" = p.id AND d."workspaceId" = ${workspaceId}
        AND d."createdAt" >= ${from} AND d."createdAt" < ${to}
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE f.rating = 'UP') AS up,
               count(*) FILTER (WHERE f.rating = 'DOWN') AS down
        FROM "DraftFeedback" f WHERE f."draftId" = d.id
      ) fb ON true
      WHERE p."workspaceId" = ${workspaceId}
      GROUP BY p.id
      ORDER BY generated DESC, p.name ASC`,
    db.$queryRaw<{ reason: string; count: number }[]>`
      SELECT reason, count(*)::int AS count
      FROM "DraftFeedback", unnest(reasons) AS reason
      WHERE "workspaceId" = ${workspaceId} AND rating = 'DOWN'
        AND "updatedAt" >= ${from} AND "updatedAt" < ${to}
      GROUP BY reason ORDER BY count DESC, reason ASC LIMIT 6`,
  ]);

  const byDay = new Map(
    dailyRows.map((row) => [startOfUtcDay(new Date(row.day)).toISOString().slice(0, 10), row])
  );
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(from.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    const row = byDay.get(date);
    return { date, generated: row?.generated ?? 0, copied: row?.copied ?? 0 };
  });

  return {
    days,
    from,
    to,
    current,
    previous,
    daily,
    profiles: profileRows,
    negativeReasons: reasonRows,
  };
}

export type WorkspaceAnalytics = Awaited<ReturnType<typeof workspaceAnalytics>>;
