import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, buttonClassName } from "@shared/ui";
import { formatRelative } from "@/components/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Watchlists" };

export default async function WatchlistsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/watchlists`);
  const canManage = can(actor.role, "watchlist.manage");
  const lists = await db.watchList.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { conversations: true } } },
  });
  const base = `/w/${workspaceId}/watchlists`;

  const card = (list: (typeof lists)[number]) => (
    <li key={list.id}>
      <Link href={`${base}/${list.id}`} className="block h-full">
        <Card className="h-full p-4 transition-colors hover:bg-surface-muted">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{list.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {list.type === "KEYWORD" ? "Keywords" : "Competitors"}
                {list.subreddit ? ` · r/${list.subreddit}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              {!list.active && <Badge>Paused</Badge>}
              {list._count.conversations > 0 && <Badge tone="primary">{list._count.conversations} conversation{list._count.conversations > 1 ? "s" : ""}</Badge>}
            </div>
          </div>
          {list.terms.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {list.terms.slice(0, 5).map((term) => (
                <Badge key={term} tone="neutral">{term}</Badge>
              ))}
              {list.terms.length > 5 && <Badge tone="neutral">+{list.terms.length - 5} more</Badge>}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Updated {formatRelative(list.updatedAt, new Date())}
          </p>
        </Card>
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Watchlists"
        description="Keywords and competitor names to watch for in conversations. Use these to tag conversations so you can track potential leads over time."
        actions={
          canManage ? (
            <Link href={`${base}/new`} className={buttonClassName("primary")}>
              New watchlist
            </Link>
          ) : undefined
        }
      />
      {lists.length === 0 ? (
        <EmptyState
          title="No watchlists yet"
          action={
            canManage ? (
              <Link href={`${base}/new`} className={buttonClassName("primary")}>
                Create a watchlist
              </Link>
            ) : undefined
          }
        >
          {canManage
            ? "Add keywords or competitor names to track in conversations."
            : "Ask a workspace admin to set up watchlists."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{lists.map(card)}</ul>
      )}
    </>
  );
}
