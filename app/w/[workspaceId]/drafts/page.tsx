import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, Label, Select, buttonClassName } from "@shared/ui";
import { formatRelative } from "@/components/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { capturedTextAvailable, listDrafts, parseDraftFilters, type DraftFilters } from "@/lib/drafts/data";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Drafts" };

function queryString(filters: DraftFilters, overrides: Partial<DraftFilters> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.profileId) params.set("profile", merged.profileId);
  if (merged.author !== "all") params.set("author", merged.author);
  if (merged.feedback !== "all") params.set("feedback", merged.feedback);
  if (merged.copied !== "all") params.set("copied", merged.copied);
  if (merged.cursor) params.set("cursor", merged.cursor);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export default async function DraftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/drafts`);
  const filters = parseDraftFilters(await searchParams);
  const base = `/w/${workspaceId}/drafts`;

  const [profiles, page, anyDrafts] = await Promise.all([
    db.brandProfile.findMany({
      where: { workspaceId },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      select: { id: true, name: true, archivedAt: true },
    }),
    listDrafts(actor, filters),
    db.draft.count({ where: { workspaceId }, take: 1 }),
  ]);
  const filtered =
    filters.profileId !== null || filters.author !== "all" || filters.feedback !== "all" || filters.copied !== "all";
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Drafts"
        description="Every AI-assisted draft in this workspace, with the brand profile it used and how it was rated."
        actions={
          can(actor.role, "draft.generate") ? (
            <Link href={`${base}/new`} className={buttonClassName("primary")}>
              New draft
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Filter drafts">
        <div className="space-y-1">
          <Label htmlFor="filter-profile">Brand profile</Label>
          <Select id="filter-profile" name="profile" defaultValue={filters.profileId ?? ""} className="w-48">
            <option value="">All profiles</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
                {profile.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-author">Author</Label>
          <Select id="filter-author" name="author" defaultValue={filters.author} className="w-32">
            <option value="all">Everyone</option>
            <option value="me">Me</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-feedback">Rating</Label>
          <Select id="filter-feedback" name="feedback" defaultValue={filters.feedback} className="w-36">
            <option value="all">Any</option>
            <option value="up">Helpful</option>
            <option value="down">Not helpful</option>
            <option value="none">Unrated</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-copied">Copied</Label>
          <Select id="filter-copied" name="copied" defaultValue={filters.copied} className="w-32">
            <option value="all">Any</option>
            <option value="yes">Copied</option>
            <option value="no">Not copied</option>
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

      {page.items.length === 0 ? (
        anyDrafts === 0 ? (
          <EmptyState
            title="No drafts yet"
            action={
              can(actor.role, "draft.generate") ? (
                <Link href={`${base}/new`} className={buttonClassName("primary")}>
                  Draft a reply
                </Link>
              ) : undefined
            }
          >
            Drafts from the browser extension and the dashboard appear here, with their feedback and versions.
          </EmptyState>
        ) : (
          <EmptyState
            title={filters.cursor ? "No older drafts" : "No drafts match these filters"}
            action={
              <Link href={base} className={buttonClassName("secondary")}>
                Show all drafts
              </Link>
            }
          />
        )
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {page.items.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`${base}/${draft.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <p className="line-clamp-2 text-sm">{draft.currentText || <em>(empty draft)</em>}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{draft.brandProfile.name}</span>
                    <span aria-hidden>·</span>
                    <span>{draft.createdBy?.name ?? "Former member"}</span>
                    <span aria-hidden>·</span>
                    <span>{draft.channel === "EXTENSION" ? "Extension" : "Dashboard"}</span>
                    {draft.sourceSubreddit && (
                      <>
                        <span aria-hidden>·</span>
                        <span>r/{draft.sourceSubreddit}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <time dateTime={draft.createdAt.toISOString()}>{formatRelative(draft.createdAt, now)}</time>
                    <span className="ml-auto flex flex-wrap gap-1">
                      {draft.copyCount > 0 && <Badge tone="success">Copied{draft.copyCount > 1 ? ` ×${draft.copyCount}` : ""}</Badge>}
                      {draft.editedAt && <Badge>Edited</Badge>}
                      {draft.up > 0 && <Badge tone="primary">Helpful{draft.up > 1 ? ` ×${draft.up}` : ""}</Badge>}
                      {draft.down > 0 && <Badge tone="warning">Not helpful{draft.down > 1 ? ` ×${draft.down}` : ""}</Badge>}
                      {draft.blockingIssues > 0 && <Badge tone="danger">Needs fixes</Badge>}
                      {draft.aiProvider === "mock" && <Badge tone="warning">Mock AI</Badge>}
                      {!capturedTextAvailable(draft, now) && <Badge>Source removed</Badge>}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(page.nextCursor || filters.cursor) && (
        <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
          {filters.cursor ? (
            <Link href={`${base}${queryString(filters, { cursor: null })}`} className="text-muted-foreground hover:text-foreground">
              ← Newest drafts
            </Link>
          ) : (
            <span />
          )}
          {page.nextCursor && (
            <Link href={`${base}${queryString(filters, { cursor: page.nextCursor })}`} className="text-muted-foreground hover:text-foreground">
              Older drafts →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
