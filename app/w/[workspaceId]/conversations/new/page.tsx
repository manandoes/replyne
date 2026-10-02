import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@shared/ui";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";

export const metadata: Metadata = { title: "New conversation" };

export default async function NewConversationPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/conversations/new`);
  const base = `/w/${workspaceId}/conversations`;

  const watchLists = await db.watchList.findMany({
    where: { workspaceId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <div className="mb-4">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">← Back to conversations</Link>
      </div>
      <PageHeader
        title="New conversation"
        description="Paste a Reddit thread or discussion you want to track."
      />
      <EmptyState title="Form coming soon">
        Add conversations via the API or wait for the UI form.
      </EmptyState>
    </>
  );
}
