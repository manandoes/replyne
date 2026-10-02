import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, buttonClassName } from "@shared/ui";
import { formatRelative } from "@/components/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Brand profiles" };

export default async function ProfilesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/profiles`);
  const canManage = can(actor.role, "profile.manage");
  const profiles = await db.brandProfile.findMany({
    where: { workspaceId },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    include: { _count: { select: { drafts: true } } },
  });
  const active = profiles.filter((profile) => !profile.archivedAt);
  const archived = profiles.filter((profile) => profile.archivedAt);
  const now = new Date();
  const base = `/w/${workspaceId}/profiles`;

  const card = (profile: (typeof profiles)[number]) => (
    <li key={profile.id}>
      <Link href={`${base}/${profile.id}`} className="block h-full">
        <Card className="h-full p-4 transition-colors hover:bg-surface-muted">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{profile.name}</p>
              <p className="truncate text-xs text-muted-foreground">Replies as {profile.brandName}</p>
            </div>
            {profile.archivedAt && <Badge>Archived</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            <Badge tone={profile.facts.length > 0 ? "neutral" : "warning"}>
              {profile.facts.length} verified {profile.facts.length === 1 ? "fact" : "facts"}
            </Badge>
            <Badge>{profile.linkPolicy === "NEVER" ? "No links" : `${profile.allowedLinkDomains.length} link domains`}</Badge>
            {profile.disclosure ? <Badge>Disclosure set</Badge> : <Badge tone="warning">No disclosure</Badge>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {profile._count.drafts} {profile._count.drafts === 1 ? "draft" : "drafts"} · updated{" "}
            {formatRelative(profile.updatedAt, now)}
          </p>
        </Card>
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Brand profiles"
        description="Each profile is a voice plus the verified facts and guardrails drafts must follow. The extension offers every active profile."
        actions={
          canManage ? (
            <Link href={`${base}/new`} className={buttonClassName("primary")}>
              New profile
            </Link>
          ) : undefined
        }
      />
      {active.length === 0 ? (
        <EmptyState
          title="No active brand profiles"
          action={
            canManage ? (
              <Link href={`${base}/new`} className={buttonClassName("primary")}>
                Create a profile
              </Link>
            ) : undefined
          }
        >
          {canManage ? "Add your brand's voice and the facts it can state." : "Ask a workspace admin to create one."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{active.map(card)}</ul>
      )}
      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Archived ({archived.length})
          </summary>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{archived.map(card)}</ul>
        </details>
      )}
    </>
  );
}
