import type { Metadata } from "next";
import Link from "next/link";
import { FEEDBACK_REASON_LABELS, type FeedbackReason } from "@shared/contracts";
import { Card, buttonClassName } from "@shared/ui";
import { DailyChart } from "@/components/daily-chart";
import { formatCount, formatDate, percent } from "@/components/format";
import { PageHeader, SegmentedLinks } from "@/components/page-header";
import { changeBetween, StatTile } from "@/components/stat-tile";
import { ANALYTICS_PERIODS, parsePeriod, workspaceAnalytics } from "@/lib/analytics";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const { user, actor, workspace } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}`);
  const days = parsePeriod((await searchParams).days);

  const [analytics, activeProfiles, totalDrafts, extensionSessions] = await Promise.all([
    workspaceAnalytics(workspaceId, days),
    db.brandProfile.count({ where: { workspaceId, archivedAt: null } }),
    db.draft.count({ where: { workspaceId } }),
    db.extensionSession.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const { current, previous } = analytics;
  const period = `previous ${days} days`;
  const rated = current.ratedUp + current.ratedDown;
  const base = `/w/${workspaceId}`;

  const steps = [
    {
      done: activeProfiles > 0,
      title: "Create a brand profile",
      body: can(actor.role, "profile.manage")
        ? "Add your brand's voice, verified facts, and guardrails."
        : "Ask a workspace admin to add one — drafts need a profile.",
      href: can(actor.role, "profile.manage") ? `${base}/profiles/new` : null,
      cta: "New profile",
    },
    {
      done: extensionSessions > 0,
      title: "Connect the browser extension",
      body: "Load the extension, click its toolbar icon, then Connect and approve the code here.",
      href: "/account",
      cta: "Connected extensions",
    },
    {
      done: totalDrafts > 0,
      title: "Draft your first reply",
      body: "Select a post or comment and choose Draft a reply — or paste text here.",
      href: can(actor.role, "draft.generate") ? `${base}/drafts/new` : null,
      cta: "New draft",
    },
  ];
  const setupDone = steps.every((step) => step.done);

  return (
    <>
      <PageHeader
        title={workspace.name}
        description="What your team drafted, used, and rated. Replyline can't see whether a reply was posted on Reddit — copying is the last step it observes."
      />

      {!setupDone && (
        <Card className="mb-6 p-5">
          <h2 className="text-sm font-semibold">Get started</h2>
          <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  {step.done ? "✓ Done" : `Step ${index + 1}`}
                </p>
                <p className="mt-0.5 text-sm font-medium">{step.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{step.body}</p>
                {!step.done && step.href && (
                  <Link href={step.href} className={buttonClassName("secondary", "sm", "mt-3")}>
                    {step.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedLinks
          label="Time period"
          options={ANALYTICS_PERIODS.map((value) => ({
            href: `${base}?days=${value}`,
            label: `Last ${value} days`,
            active: value === days,
          }))}
        />
        <p className="text-xs text-muted-foreground">
          {formatDate(analytics.from)} – {formatDate(new Date(analytics.to.getTime() - 1))} (UTC)
        </p>
      </div>

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Drafts generated"
          value={formatCount(current.generated)}
          change={changeBetween(current.generated, previous.generated)}
          period={period}
          sub={
            current.generated > 0
              ? `${percent(current.extension, current.generated)}% from the extension`
              : undefined
          }
        />
        <StatTile
          label="Drafts copied"
          value={formatCount(current.copied)}
          change={changeBetween(current.copied, previous.copied)}
          period={period}
          sub={current.generated > 0 ? `${percent(current.copied, current.generated)}% of drafts` : undefined}
        />
        <StatTile
          label="Rated helpful"
          value={rated > 0 ? `${percent(current.ratedUp, rated)}%` : "—"}
          sub={rated > 0 ? `${current.ratedUp} of ${rated} ratings` : "No ratings yet"}
        />
        <StatTile
          label="Active members"
          value={formatCount(current.activeMembers)}
          change={changeBetween(current.activeMembers, previous.activeMembers)}
          period={period}
          sub="drafted or rated"
        />
      </section>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold">Drafts generated per day</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {formatCount(current.edited)} of {formatCount(current.generated)} drafts were edited before use.
        </p>
        {current.generated === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No drafts in this period.</p>
        ) : (
          <DailyChart
            title={`Drafts generated per day, last ${days} days`}
            unit="draft"
            data={analytics.daily.map((day) => ({ date: day.date, value: day.generated }))}
          />
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="text-sm font-semibold">By brand profile</h2>
          <p className="mb-3 text-xs text-muted-foreground">Drafts created in this period and how they were rated.</p>
          {analytics.profiles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No drafts in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 pr-3 font-medium">Profile</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Drafts</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Copied</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Helpful</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">Not helpful</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {analytics.profiles.map((profile) => (
                    <tr key={profile.id}>
                      <td className="py-2 pr-3">
                        <Link href={`${base}/drafts?profile=${profile.id}`} className="hover:underline">
                          {profile.name}
                        </Link>
                        {profile.archived && <span className="text-xs text-muted-foreground"> (archived)</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{profile.generated}</td>
                      <td className="px-3 py-2 text-right">
                        {profile.copied}
                        <span className="text-xs text-muted-foreground"> ({percent(profile.copied, profile.generated)}%)</span>
                      </td>
                      <td className="px-3 py-2 text-right">{profile.up}</td>
                      <td className="py-2 pl-3 text-right">{profile.down}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Why drafts missed</h2>
          <p className="mb-3 text-xs text-muted-foreground">Reasons given with “not helpful” ratings.</p>
          {analytics.negativeReasons.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No “not helpful” ratings in this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {analytics.negativeReasons.map((row) => {
                const maxCount = analytics.negativeReasons[0]?.count ?? 1;
                return (
                  <li key={row.reason}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{FEEDBACK_REASON_LABELS[row.reason as FeedbackReason] ?? row.reason}</span>
                      <span className="tabular-nums text-muted-foreground">{row.count}</span>
                    </div>
                    <div
                      aria-hidden
                      className="mt-1 h-2 rounded-r-sm bg-viz-series"
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Recurring reasons automatically become guidance for that brand profile&apos;s future drafts.
          </p>
        </Card>
      </div>
    </>
  );
}
