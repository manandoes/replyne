import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, buttonClassName } from "@shared/ui";
import { formatRelative } from "@/components/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { OPPORTUNITY_STAGE_LABELS, RESOLVED_STAGES } from "@shared/contracts";

export const metadata: Metadata = { title: "Opportunities" };

type PipelineFilters = {
  stage: string | null;
};

function parseFilters(searchParams: Record<string, string | string[] | undefined>): PipelineFilters {
  const stage = Array.isArray(searchParams.stage)
    ? (searchParams.stage[0] ?? null)
    : (searchParams.stage ?? null);
  return { stage };
}

function queryString(filters: PipelineFilters, overrides: Partial<PipelineFilters> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.stage) params.set("stage", merged.stage);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export default async function OpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/opportunities`);
  const canManage = can(actor.role, "opportunity.manage");
  const filters = parseFilters(await searchParams);
  const base = `/w/${workspaceId}/opportunities`;

  const [opportunities, pipelineSummary] = await Promise.all([
    db.opportunity.findMany({
      where: {
        workspaceId,
        ...(filters.stage ? { stage: filters.stage as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        stage: true,
        notes: true,
        lastContactAt: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
        conversation: { select: { id: true, title: true, sourceUrl: true } },
      },
    }),
    db.opportunity.groupBy({
      by: ["stage"],
      where: { workspaceId },
      _count: { _all: true },
    }),
  ]);

  const filtered = filters.stage !== null;
  const now = new Date();

  // Build pipeline summary map
  const stageCounts = new Map<string, number>();
  for (const row of pipelineSummary) {
    stageCounts.set(row.stage, row._count._all);
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Leads and requests tracked through a manual pipeline. Replyline drafts suggestions — you decide whether and how to act."
      />

      {/* Pipeline summary */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["NEW", "REVIEWING", "DRAFT_READY", "MANUALLY_CONTACTED", "FOLLOW_UP", "QUALIFIED", "CLOSED", "IRRELEVANT"] as const).map((stage) => (
          <Link
            key={stage}
            href={`${base}${queryString(filters, { stage: filters.stage === stage ? null : stage })}`}
            className={buttonClassName(filters.stage === stage ? "primary" : "secondary", "sm")}
          >
            {OPPORTUNITY_STAGE_LABELS[stage]} ({stageCounts.get(stage) ?? 0})
          </Link>
        ))}
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Filter opportunities">
        <div className="space-y-1">
          <label htmlFor="filter-stage" className="text-xs text-muted-foreground">Stage</label>
          <select id="filter-stage" name="stage" defaultValue={filters.stage ?? ""} className="w-40 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">All stages</option>
            {(["NEW", "REVIEWING", "DRAFT_READY", "MANUALLY_CONTACTED", "FOLLOW_UP", "QUALIFIED", "CLOSED", "IRRELEVANT"] as const).map((s) => (
              <option key={s} value={s}>{OPPORTUNITY_STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">Apply</Button>
        {filtered && (
          <Link href={base} className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      {opportunities.length === 0 ? (
        <EmptyState
          title={filtered ? "No opportunities match this filter" : "No opportunities yet"}
          action={
            canManage ? (
              <Link href={`${base}/new`} className={buttonClassName("primary")}>
                New opportunity
              </Link>
            ) : undefined
          }
        >
          {canManage
            ? "Create opportunities from conversations to track leads through a pipeline."
            : "Ask a workspace admin to create opportunities."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {opportunities.map((opp) => (
            <li key={opp.id}>
              <Link href={`${base}/${opp.id}`} className="block">
                <Card className="p-4 transition-colors hover:bg-surface-muted">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{opp.title}</p>
                      {opp.conversation.title && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          From: {opp.conversation.title}
                        </p>
                      )}
                      {opp.notes && (
                        <p className="mt-1 text-xs text-muted-foreground italic line-clamp-2">
                          {opp.notes}
                        </p>
                      )}
                    </div>
                    <Badge tone={RESOLVED_STAGES.includes(opp.stage as any) ? "success" : "neutral"}>
                      {OPPORTUNITY_STAGE_LABELS[opp.stage as keyof typeof OPPORTUNITY_STAGE_LABELS] ?? opp.stage}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {opp.lastContactAt && (
                      <span>Contacted {formatRelative(opp.lastContactAt, now)}</span>
                    )}
                    {opp.resolvedAt && (
                      <span>Resolved {formatRelative(opp.resolvedAt, now)}</span>
                    )}
                    <span>Created {formatRelative(opp.createdAt, now)}</span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
