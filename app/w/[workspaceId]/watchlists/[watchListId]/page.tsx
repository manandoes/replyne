import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, buttonClassName } from "@shared/ui";
import { formatRelative } from "@/components/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Watchlist" };

export default async function WatchlistPage({
  params,
}: {
  params: Promise<{ workspaceId: string; watchListId: string }>;
}) {
  const { workspaceId, watchListId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/watchlists/${watchListId}`);
  const canManage = can(actor.role, "watchlist.manage");

  const list = await db.watchList.findFirst({
    where: { id: watchListId, workspaceId },
    include: {
      conversations: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          sourceType: true,
          author: true,
          summary: true,
          textChars: true,
          textExpiresAt: true,
          textPurgedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { opportunities: true } },
        },
      },
      _count: { select: { conversations: true } },
    },
  });

  if (!list) notFound();

  const base = `/w/${workspaceId}/watchlists`;
  const now = new Date();

  return (
    <>
      <PageHeader
        title={list.name}
        description={`${list.type === "KEYWORD" ? "Keywords" : "Competitors"}: ${list.terms.join(", ") || "none"}`}
        actions={
          canManage ? (
            <Link href={`${base}/${watchListId}/edit`} className={buttonClassName("secondary")}>
              Edit
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge>{list.type}</Badge>
        {list.subreddit && <Badge>r/{list.subreddit}</Badge>}
        {!list.active && <Badge tone="warning">Paused</Badge>}
        <Badge tone="neutral">{list._count.conversations} conversation{list._count.conversations !== 1 ? "s" : ""}</Badge>
      </div>

      {list.conversations.length === 0 ? (
        <EmptyState title="No conversations tagged yet">
          Conversations matched to this watchlist will appear here.
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.conversations.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`/w/${workspaceId}/conversations/${conv.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <p className="line-clamp-2 text-sm">
                    {conv.title || <em>(no title)</em>}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{conv.sourceType === "CAPTURE" ? "Captured" : conv.sourceType === "MANUAL" ? "Manual" : "API"}</span>
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
