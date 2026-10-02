import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, buttonClassName } from "@shared/ui";
import { formatRelative, formatDate } from "@/components/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { CONVERSATION_SOURCE_LABELS, OPPORTUNITY_STAGE_LABELS, RESOLVED_STAGES } from "@shared/contracts";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ workspaceId: string; conversationId: string }>;
}) {
  const { workspaceId, conversationId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/conversations/${conversationId}`);
  const canManage = can(actor.role, "conversation.manage");
  const canCreateOpportunity = can(actor.role, "opportunity.manage");

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: {
      watchList: { select: { id: true, name: true } },
      opportunities: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          stage: true,
          notes: true,
          lastContactAt: true,
          resolvedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) notFound();

  const base = `/w/${workspaceId}/conversations`;
  const now = new Date();

  return (
    <>
      <PageHeader
        title={conversation.title || "Untitled conversation"}
        description={
          conversation.watchList
            ? `Tagged: ${conversation.watchList.name}`
            : "No watchlist"
        }
        actions={
          canManage ? (
            <Link href={`${base}/${conversationId}/edit`} className={buttonClassName("secondary")}>
              Edit
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone="neutral">{CONVERSATION_SOURCE_LABELS[conversation.sourceType as keyof typeof CONVERSATION_SOURCE_LABELS] ?? conversation.sourceType}</Badge>
        {conversation.sourceSubreddit && <Badge>r/{conversation.sourceSubreddit}</Badge>}
        {conversation.author && <Badge tone="neutral">{conversation.author}</Badge>}
        {!conversation.textPurgedAt && conversation.textChars > 0 && (
          <Badge tone="neutral">{conversation.textChars} chars · expires {formatDate(new Date(conversation.textExpiresAt.getTime() - 86400000))}</Badge>
        )}
        {conversation.textPurgedAt && <Badge tone="warning">Text purged</Badge>}
      </div>

      {conversation.text && !conversation.textPurgedAt ? (
        <Card className="mb-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Conversation text</h2>
          <pre className="whitespace-pre-wrap text-sm font-mono text-muted-foreground">{conversation.text}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            This text will be purged automatically. {conversation.textExpiresAt.toLocaleDateString()} is the expiry date.
          </p>
        </Card>
      ) : (
        <Card className="mb-4 p-4">
          <p className="text-sm text-muted-foreground">Source text has been purged.</p>
        </Card>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Opportunities</h2>
        {canCreateOpportunity && (
          <Link href={`${base}/${conversationId}/opportunity/new`} className={buttonClassName("primary", "sm")}>
            New opportunity
          </Link>
        )}
      </div>

      {conversation.opportunities.length === 0 ? (
        <EmptyState title="No opportunities yet">
          {canCreateOpportunity
            ? "Create an opportunity to start tracking this conversation through a pipeline."
            : "Ask a workspace admin to create opportunities."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {conversation.opportunities.map((opp) => (
            <li key={opp.id}>
              <Link href={`/w/${workspaceId}/opportunities/${opp.id}`} className="block">
                <Card className="p-4 transition-colors hover:bg-surface-muted">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{opp.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {opp.notes ? <span className="italic line-clamp-2">{opp.notes}</span> : "No notes"}
                      </p>
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
