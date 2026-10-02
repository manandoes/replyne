import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "New watchlist" };

export default async function NewWatchlistPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/watchlists/new`);
  if (!can(actor.role, "watchlist.manage")) {
    throw new Error("Forbidden");
  }
  const base = `/w/${workspaceId}/watchlists`;
  return (
    <>
      <div className="mb-4">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">← Back to watchlists</Link>
      </div>
      <PageHeader
        title="New watchlist"
        description="Add keywords or competitor names that you want to track across conversations."
      />
      <EmptyState title="Form coming soon">
        Create watchlists via the API or wait for the UI form.
      </EmptyState>
    </>
  );
}
