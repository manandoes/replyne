import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, Label, Select, buttonClassName } from "@shared/ui";
import { formatRelative } from "@/components/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";

export const metadata: Metadata = { title: "Conversations" };

type Filters = {
  watchListId: string | null;
  sourceType: string | null;
};

function parseFilters(searchParams: Record<string, string | string[] | undefined>): Filters {
  const watchListId = Array.isArray(searchParams.watchListId)
    ? (searchParams.watchListId[0] ?? null)
    : (searchParams.watchListId ?? null);
  const sourceType = Array.isArray(searchParams.sourceType)
    ? (searchParams.sourceType[0] ?? null)
    : (searchParams.sourceType ?? null);
  return { watchListId, sourceType };
}

function queryString(filters: Filters, overrides: Partial<Filters> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.watchListId) params.set("watchListId", merged.watchListId);
  if (merged.sourceType) params.set("sourceType", merged.sourceType);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/conversations`);
  const filters = parseFilters(await searchParams);
  const base = `/w/${workspaceId}/conversations`;

  const [watchLists, conversations] = await Promise.all([
    db.watchList.findMany({
      where: { workspaceId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.conversation.findMany({
      where: {
        workspaceId,
        ...(filters.watchListId ? { watchListId: filters.watchListId } : {}),
        ...(filters.sourceType ? { sourceType: filters.sourceType as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        sourceType: true,
        sourceSubreddit: true,
        author: true,
        summary: true,
        textChars: true,
        textExpiresAt: true,
        textPurgedAt: true,
        lastCommentAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { opportunities: true } },
      },
    }),
  ]);

  const filtered = filters.watchListId !== null || filters.sourceType !== null;
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Reddit threads and discussions worth tracking. Text is purged after the retention window."
        actions={
          <Link href={`${base}/new`} className={buttonClassName("primary")}>
            New conversation
          </Link>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Filter conversations">
        <div className="space-y-1">
          <Label htmlFor="filter-watchlist">Watchlist</Label>
          <Select id="filter-watchlist" name="watchListId" defaultValue={filters.watchListId ?? ""} className="w-48">
            <option value="">All watchlists</option>
            {watchLists.map((wl) => (
              <option key={wl.id} value={wl.id}>
                {wl.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-source">Source</Label>
          <Select id="filter-source" name="sourceType" defaultValue={filters.sourceType ?? ""} className="w-40">
            <option value="">All sources</option>
            <option value="CAPTURE">Captured</option>
            <option value="MANUAL">Manual paste</option>
            <option value="REDDIT_DATA_API">Reddit Data API</option>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {filtered && (
          <Link href={base} className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      {conversations.length === 0 ? (
        <EmptyState
          title={filtered ? "No conversations match these filters" : "No conversations yet"}
          action={
            <Link href={`${base}/new`} className={buttonClassName("primary")}>
              Add a conversation
            </Link>
          }
        >
          Paste a Reddit thread or captured text to start tracking.
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`${base}/${conv.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <p className="line-clamp-2 text-sm">
                    {conv.title || <em>(no title)</em>}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Badge tone="neutral">{conv.sourceType === "CAPTURE" ? "Captured" : conv.sourceType === "MANUAL" ? "Manual" : "API"}</Badge>
                    {conv.sourceSubreddit && (
                      <>
                        <span aria-hidden>·</span>
                        <span>r/{conv.sourceSubreddit}</span>
                      </>
                    )}
                    {conv.author && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{conv.author}</span>
                      </>
                    )}
                    {conv.summary && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="italic">{conv.summary}</span>
                      </>
                    )}
                    {!conv.textPurgedAt && conv.textChars > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{conv.textChars} chars</span>
                      </>
                    )}
                    {conv.textPurgedAt && <Badge tone="warning">Text purged</Badge>}
                    {conv._count.opportunities > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <Badge tone="primary">{conv._count.opportunities} opportunity{conv._count.opportunities > 1 ? "s" : ""}</Badge>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <time dateTime={conv.createdAt.toISOString()}>{formatRelative(conv.createdAt, now)}</time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
